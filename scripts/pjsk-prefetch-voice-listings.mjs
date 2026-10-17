import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sha256 } from './pjsk-scenario.mjs';
import { parseVoiceListing } from './pjsk-voice-listing.mjs';
import { writeJson } from './pjsk-import.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values: options } = parseArgs({
  options: {
    manifest: { type: 'string', default: 'docs/pjsk-all-events.json' },
    report: {
      type: 'string',
      default: 'all-events-voice-listings-report.json',
    },
    workers: { type: 'string', default: '8' },
  },
});
const workers = Number(options.workers);
if (!Number.isInteger(workers) || workers < 1 || workers > 8)
  throw new Error('Listing workers must be between one and eight.');
const stage = resolve(root, '.cache/pjsk/prefetch');
await mkdir(stage, { recursive: true });
const reportPath = resolve(stage, options.report);
const totals = {
  packages: 0,
  missingPackages: 0,
  directories: 0,
  ready: 0,
  pages: 0,
  cached: 0,
  downloaded: 0,
  audioDownloaded: 0,
  rateLimited: 0,
};
const failures = [],
  missingPackages = [],
  results = [];
let existing = {},
  indexRefreshed = 0,
  refreshing = null,
  nextRequestAt = 0,
  cooldownUntil = 0;
const startedAt = new Date().toISOString();
const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));
async function refreshIndex() {
  if (Date.now() - indexRefreshed < 5000) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      existing = JSON.parse(
        await readFile(
          resolve(pjskLibraryRoot, 'private/pjsk/sources.json'),
          'utf8',
        ),
      );
    } catch (error) {
      if (!['ENOENT', 'EPERM', 'EBUSY'].includes(error.code)) throw error;
    }
    indexRefreshed = Date.now();
  })();
  try {
    await refreshing;
  } finally {
    refreshing = null;
  }
}
async function verified(record, url, path) {
  if (record?.sourceUrl !== url || !/^[a-f0-9]{64}$/.test(record.sha256))
    return null;
  try {
    const data = await readFile(path);
    return data.length === record.bytes && sha256(data) === record.sha256
      ? data
      : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function requestSlot() {
  while (true) {
    const due = Math.max(Date.now(), nextRequestAt, cooldownUntil);
    nextRequestAt = due + 125;
    await sleep(due - Date.now());
    if (Date.now() >= cooldownUntil) return;
  }
}
async function acquire(url) {
  if (
    !url.startsWith('https://raw.githubusercontent.com/Sekai-World/') &&
    !url.startsWith(
      'https://storage.sekai.best/sekai-jp-assets/?list-type=2&prefix=',
    )
  )
    throw new Error('Listing prefetch cannot download audio or arbitrary URLs');
  await refreshIndex();
  const cached = existing[url];
  if (
    cached?.url?.startsWith('/private/pjsk/assets/') &&
    !cached.url.includes('..')
  ) {
    const data = await verified(
      cached,
      url,
      resolve(pjskLibraryRoot, '.' + cached.url),
    );
    if (data) {
      totals.cached++;
      return data;
    }
  }
  const descriptorPath = resolve(stage, `${sha256(url)}.json`);
  let staged;
  try {
    staged = JSON.parse(await readFile(descriptorPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (staged) {
    const data = await verified(staged, url, staged.path);
    if (data) {
      totals.cached++;
      return data;
    }
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await requestSlot();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (response.status === 429) {
        totals.rateLimited++;
        const value = response.headers.get('retry-after');
        const supplied = /^\d+$/.test(value ?? '')
          ? Number(value) * 1000
          : Date.parse(value ?? '') - Date.now();
        cooldownUntil = Math.max(
          cooldownUntil,
          Date.now() +
            Math.max(
              Number.isFinite(supplied) ? supplied : 0,
              Math.min(60000, 15000 * 2 ** attempt),
            ),
        );
        throw new Error('HTTP 429');
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (url.includes('?list-type=2'))
        parseVoiceListing(data.toString('utf8'));
      else JSON.parse(data.toString('utf8'));
      const digest = sha256(data),
        path = resolve(stage, `${digest}.bin`);
      let present;
      try {
        present = await readFile(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!present || sha256(present) !== digest) {
        const temporary = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, data);
          for (let renameAttempt = 0; ; renameAttempt++) {
            try {
              await rename(temporary, path);
              break;
            } catch (error) {
              if (
                renameAttempt === 4 ||
                !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
              )
                throw error;
              await sleep(25 * 2 ** renameAttempt);
            }
          }
        } finally {
          await unlink(temporary).catch(() => {});
        }
      }
      await writeJson(descriptorPath, {
        sourceUrl: url,
        sha256: digest,
        bytes: data.length,
        path,
      });
      totals.downloaded++;
      return data;
    } catch (error) {
      if (
        attempt === 5 ||
        /HTTP 404|Invalid original voice listing|Truncated original voice listing/.test(
          error.message,
        )
      )
        throw error;
      await sleep(250 * 2 ** attempt);
    }
  }
}
async function checkpoint(status) {
  await writeJson(reportPath, {
    status,
    startedAt,
    updatedAt: new Date().toISOString(),
    ...totals,
    failures,
    missingPackages,
    results,
  });
}

const manifest = JSON.parse(
  await readFile(resolve(root, options.manifest), 'utf8'),
);
const directories = new Set(),
  characterIds = new Set();
for (const episode of (manifest.groups ?? manifest.events).flatMap(
  (group) => group.episodes,
)) {
  let pkg;
  try {
    pkg = JSON.parse(
      await readFile(
        resolve(
          root,
          '.cache/pjsk/packages',
          `${episode.id}-${episode.scenarioId}.json`,
        ),
        'utf8',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missingPackages.push(episode.scenarioId);
    totals.missingPackages++;
    continue;
  }
  totals.packages++;
  directories.add(`sound/scenario/voice/${pkg.entry.scenarioId}/`);
  for (const dependency of pkg.scenario.dependencies.filter(
    (item) => item.kind === 'voice',
  )) {
    if (dependency.candidatePath)
      directories.add(
        dependency.candidatePath.slice(
          0,
          dependency.candidatePath.lastIndexOf('/') + 1,
        ),
      );
  }
  for (const voice of pkg.scenario.source.TalkData.flatMap(
    (talk) => talk.Voices,
  ))
    characterIds.add(voice.Character2dId);
}
const characters = JSON.parse(
  (
    await acquire(
      'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/character2ds.json',
    )
  ).toString('utf8'),
);
for (const character of characters.filter((character) =>
  characterIds.has(character.id),
)) {
  directories.add(
    `sound/scenario/part_voice/${character.assetName}_${character.unit}/`,
  );
  directories.add(
    `sound/scenario/voice/part_voice_${character.assetName}_${character.unit}/`,
  );
}
const queue = [...directories];
totals.directories = queue.length;
console.log(
  `Verify directory listings only: ${totals.packages} packages, ${queue.length} folders, ${workers} workers, 8 requests/second`,
);
await checkpoint('running');
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (queue.length) {
      const directory = queue.shift();
      try {
        if (
          !/^sound\/[a-zA-Z0-9_./-]+\/$/.test(directory) ||
          directory.includes('..')
        )
          throw new Error(`Invalid voice directory: ${directory}`);
        let continuation = '',
          pages = 0,
          clips = 0;
        const seen = new Set();
        do {
          const url = `https://storage.sekai.best/sekai-jp-assets/?list-type=2&prefix=${encodeURIComponent(directory)}${continuation ? `&continuation-token=${encodeURIComponent(continuation)}` : ''}`;
          const page = parseVoiceListing((await acquire(url)).toString('utf8'));
          for (const entry of page.entries) {
            if (!entry.key.startsWith(directory) || entry.key.includes('..'))
              throw new Error('Unexpected listing path');
            if (entry.key.endsWith('.mp3') && entry.bytes > 0) {
              if (!/^[a-f0-9]{32}$/.test(entry.md5))
                throw new Error('Audio lacks single-file MD5 proof');
              clips++;
            }
          }
          pages++;
          totals.pages++;
          continuation = page.continuation;
          if (continuation && seen.has(continuation))
            throw new Error('Repeated listing continuation token');
          seen.add(continuation);
        } while (continuation);
        totals.ready++;
        results.push({ directory, pages, clips });
      } catch (error) {
        failures.push({ directory, error: error.message });
      }
      if ((totals.ready + failures.length) % 25 === 0 || !queue.length) {
        console.log(JSON.stringify({ ...totals, failures: failures.length }));
        await checkpoint('running');
      }
    }
  }),
);
await checkpoint('complete');
console.log(
  JSON.stringify({ ...totals, failures: failures.length, reportPath }),
);
if (failures.length) process.exitCode = 1;
