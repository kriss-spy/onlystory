import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256, assetBase } from './pjsk-scenario.mjs';
import { writeJson } from './pjsk-import.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';
import { parseVoiceListing } from './pjsk-voice-listing.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values: options } = parseArgs({
  options: {
    manifest: { type: 'string' },
    report: { type: 'string' },
    workers: { type: 'string' },
    'allow-missing': { type: 'boolean' },
    'worker-control': { type: 'string' },
    'max-rps': { type: 'string' },
    'skip-voices': { type: 'boolean' },
  },
});
const workers = Number(options.workers ?? 12);
const maxRps = Number(options['max-rps'] ?? 8);
if (!Number.isFinite(maxRps) || maxRps <= 0 || maxRps > 100)
  throw new Error(
    'Media request budget must be between 0 and 100 requests/second.',
  );
if (!Number.isInteger(workers) || workers < 1 || workers > 64)
  throw new Error('Prefetch workers must be between 1 and 64.');
const directory = resolve(root, '.cache/pjsk/prefetch');
await mkdir(directory, { recursive: true });
const manifest = JSON.parse(
  await readFile(
    resolve(root, options.manifest ?? 'docs/pjsk-validation-corpus.json'),
    'utf8',
  ),
);
let existing = {};
let refreshedIndexAt = 0;
let refreshingIndex = null;
try {
  existing = JSON.parse(
    await readFile(
      resolve(pjskLibraryRoot, 'private/pjsk/sources.json'),
      'utf8',
    ),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
async function refreshLibraryIndex() {
  if (Date.now() - refreshedIndexAt < 5000) return;
  if (refreshingIndex) return refreshingIndex;
  refreshingIndex = (async () => {
    try {
      existing = JSON.parse(
        await readFile(
          resolve(pjskLibraryRoot, 'private/pjsk/sources.json'),
          'utf8',
        ),
      );
    } catch (error) {
      // An antivirus/index replacement may briefly deny a read. Keep the last
      // verified snapshot and try again later; never rewrite the primary index.
      if (!['ENOENT', 'EPERM', 'EBUSY'].includes(error.code)) throw error;
    }
    refreshedIndexAt = Date.now();
  })();
  try {
    await refreshingIndex;
  } finally {
    refreshingIndex = null;
  }
}
let nextRequestAt = 0;
let cooldownUntil = 0;
async function waitForRequestSlot() {
  while (true) {
    const due = Math.max(Date.now(), nextRequestAt, cooldownUntil);
    nextRequestAt = due + 1000 / maxRps;
    if (due > Date.now())
      await new Promise((done) => setTimeout(done, due - Date.now()));
    if (Date.now() >= cooldownUntil) return;
  }
}
const jobs = new Set();
const movieDirectories = new Map();
const movieEvidence = [];
let skippedVoiceReferences = 0;
const missingPackages = [];
const effectDirectories = new Map();
const effectEvidence = [];
const base = assetBase(manifest.mediaRegion);
const { backgrounds: videoBackgrounds } = JSON.parse(
  await readFile(resolve(root, 'docs/pjsk-video-backgrounds.json'), 'utf8'),
);
const pinnedAssets = new Map();
for (const asset of Object.values(videoBackgrounds)) {
  pinnedAssets.set(asset.sourceUrl, asset);
  for (const record of asset.nativeMetadata)
    pinnedAssets.set(record.url, record);
}
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
    if (!options['allow-missing'] || error.code !== 'ENOENT') throw error;
    missingPackages.push(episode.scenarioId);
    continue;
  }
  for (const record of pkg.scenario.source.SpecialEffectData) {
    if (record.EffectType === 19) {
      const name = record.StringVal;
      if (!/^[a-zA-Z0-9_-]+$/.test(name))
        throw new Error(`Invalid native movie: ${name}`);
      jobs.add(
        base +
          (name.endsWith('_opening')
            ? `movie/${name}/${name.slice(0, -'_opening'.length)}.mp4`
            : `scenario/movie/${name}/${name}.mp4`),
      );
      if (!name.endsWith('_opening'))
        movieDirectories.set(name, base + `scenario/movie/${name}/${name}.mp4`);
    }
    if (record.EffectType !== 15 || !record.StringVal) continue;
    const directory =
      record.StringValSub || `scenario/effect/${record.StringVal}`;
    if (!/^scenario\/effect\/[a-zA-Z0-9_-]+$/.test(directory))
      throw new Error(`Invalid native effect directory: ${directory}`);
    effectDirectories.set(directory, record.StringVal);
  }
  for (const dep of pkg.scenario.dependencies) {
    if (dep.kind === 'background' && videoBackgrounds[dep.reference]) {
      const asset = videoBackgrounds[dep.reference];
      jobs.add(asset.sourceUrl);
      for (const record of asset.nativeMetadata) jobs.add(record.url);
      continue;
    }
    if (!['background', 'bgm', 'voice', 'sound-effect'].includes(dep.kind))
      continue;
    if (dep.kind === 'voice') {
      if (options['skip-voices']) {
        skippedVoiceReferences++;
        continue;
      }
      const part =
        /^partvoice_\d+_(02[1-6])(?:_(band|idol|street|night|wonder))?$/.exec(
          dep.reference,
        );
      if (part) {
        const id = Number(part[1]);
        const actor = {
          21: 'miku',
          22: 'rin',
          23: 'len',
          24: 'luka',
          25: 'meiko',
          26: 'kaito',
        }[id];
        const unit =
          {
            band: 'light_sound',
            idol: 'idol',
            street: 'street',
            night: 'school_refusal',
            wonder: 'theme_park',
          }[part[2]] ?? 'piapro';
        // Shared part voices belong to their filename's original singer. A
        // mascot may reference Miku's clips with its own Character2dId.
        jobs.add(
          base +
            `sound/scenario/part_voice/${id}${actor}_${unit}/${encodeURIComponent(dep.reference)}.mp3`,
        );
        continue;
      }
      jobs.add(
        base +
          `sound/scenario/voice/${episode.scenarioId}/${encodeURIComponent(dep.reference)}.mp3`,
      );
    } else if (dep.candidatePath) jobs.add(base + dep.candidatePath);
    else if (dep.kind === 'sound-effect') {
      if (dep.reference.startsWith('se_event')) {
        jobs.add(
          base +
            `event_story/${dep.reference.split('_').slice(1, -1).join('_')}/scenario_se/${dep.reference}.mp3`,
        );
        // Event-specific clips live in their own source bundle. The generic
        // sound pack cannot contain these names (verified against the corpus).
        continue;
      }
      const pack =
        /^se\d{5}$/.test(dep.reference) && Number(dep.reference.slice(2)) <= 528
          ? 'se_pack00001'
          : 'se_pack00001_b';
      jobs.add(base + `sound/scenario/se/${pack}/${dep.reference}.mp3`);
    }
  }
}
const directories = [...effectDirectories];
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (directories.length) {
      const [directory, name] = directories.shift();
      const url = `${base}?list-type=2&prefix=${encodeURIComponent(directory + '/')}`;
      const evidencePath = resolve(
        root,
        '.cache/pjsk/prefetch',
        `${sha256(url)}.listing.json`,
      );
      let evidence;
      try {
        evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!evidence) {
        let xml;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await waitForRequestSlot();
            const response = await fetch(url, {
              signal: AbortSignal.timeout(30000),
            });
            if (!response.ok)
              throw new Error(`HTTP ${response.status}: ${url}`);
            xml = await response.text();
            if (!xml.includes('<ListBucketResult'))
              throw new Error(`Invalid effect listing: ${url}`);
            break;
          } catch (error) {
            if (attempt === 2) throw error;
          }
        }
        const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(
          (match) => match[1],
        );
        if (xml.includes('<IsTruncated>true</IsTruncated>'))
          throw new Error(`Truncated effect listing: ${url}`);
        evidence = {
          name,
          directory,
          sourceUrl: url,
          sha256: sha256(xml),
          keys,
          rawXml: xml,
        };
        await writeJson(evidencePath, evidence);
      }
      if (
        evidence.sourceUrl !== url ||
        sha256(evidence.rawXml) !== evidence.sha256
      )
        throw new Error(`Corrupt effect listing: ${url}`);
      for (const key of evidence.keys.filter((key) =>
        /\.(webp|png|jpe?g)$/i.test(key),
      )) {
        if (!key.startsWith(directory + '/') || key.includes('..'))
          throw new Error(`Invalid effect texture key: ${key}`);
        jobs.add(base + key);
      }
      effectEvidence.push({
        name,
        directory,
        sourceUrl: url,
        sha256: evidence.sha256,
        textures: evidence.keys.filter((key) =>
          /\.(webp|png|jpe?g)$/i.test(key),
        ),
      });
    }
  }),
);
// Stage the small shared effect atlases first so renderers can inspect them
// while the much larger episode voice queue continues in source order.
const queue = [...jobs].sort(
  (a, b) =>
    Number(b.includes('/scenario/effect/')) -
    Number(a.includes('/scenario/effect/')),
);
const totals = {
  total: queue.length,
  downloaded: 0,
  cached: 0,
  missing: 0,
  failed: 0,
};
const failures = [];
const inFlight = new Map();
const network = {
  completed: 0,
  bytes: 0,
  headersMs: 0,
  bodyMs: 0,
  writeMs: 0,
  attempts: 0,
  retries: 0,
  rateLimited: 0,
  recentErrors: [],
};

let completed = 0;
const startedAt = new Date().toISOString();
let workerCount = 0;
const reportPath = resolve(directory, options.report ?? 'report.json');
async function checkpoint(status) {
  await writeJson(reportPath, {
    status,
    complete:
      status === 'complete' &&
      !totals.failed &&
      !totals.missing &&
      !missingPackages.length,
    startedAt,
    updatedAt: new Date().toISOString(),
    completed,
    workers: workerCount || workers,
    ...totals,
    failures,
    missingPackages,
    skipVoices: !!options['skip-voices'],
    skippedVoiceReferences,
    effects: effectEvidence,
    movies: movieEvidence,
    network,
    maxRps,
    cooldownUntil:
      cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
    inFlight: [...inFlight.values()].map((request) => ({
      ...request,
      ageMs: Date.now() - request.startedAt,
    })),
  });
}
async function valid(record, path) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.sha256)) return false;
  const pin = pinnedAssets.get(record.sourceUrl);
  if (pin && (record.sha256 !== pin.sha256 || record.bytes !== pin.bytes))
    return false;
  try {
    const data = await readFile(path);
    return data.length === record.bytes && sha256(data) === record.sha256;
  } catch {
    return false;
  }
}
async function acquire(url, { listing = false } = {}) {
  listing ||= pinnedAssets.has(url) && url.includes('?list-type=2&');
  await refreshLibraryIndex();
  const cached = existing[url];
  if (
    cached?.sourceUrl === url &&
    cached.url.startsWith('/private/pjsk/assets/') &&
    !cached.url.includes('..') &&
    (await valid(cached, resolve(pjskLibraryRoot, '.' + cached.url)))
  ) {
    totals.cached++;
    return;
  }
  const metadataPath = resolve(directory, `${sha256(url)}.json`);
  let staged;
  try {
    staged = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (staged?.sourceUrl === url && (await valid(staged, staged.path))) {
    totals.cached++;
    return;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await waitForRequestSlot();
    network.attempts++;
    const started = Date.now();
    const request = { url, phase: 'headers', startedAt: started };
    inFlight.set(url, request);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      network.headersMs += Date.now() - started;
      if (response.status === 429) {
        network.rateLimited++;
        const retryAfter = response.headers.get('retry-after');
        const suppliedDelay =
          retryAfter && /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : retryAfter
              ? Date.parse(retryAfter) - Date.now()
              : 0;
        const delay = Math.max(
          Number.isFinite(suppliedDelay) ? suppliedDelay : 0,
          Math.min(60000, 15000 * 2 ** attempt),
        );
        cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
        const error = new Error(`HTTP 429; global media cooldown ${delay}ms`);
        error.rateLimited = true;
        throw error;
      }
      if (response.status === 404) {
        totals.missing++;
        failures.push({ url, status: 404 });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (
        /text\/html/.test(response.headers.get('content-type') ?? '') ||
        (!listing && /xml/.test(response.headers.get('content-type') ?? ''))
      )
        throw new Error('Unexpected error document');
      request.phase = 'body';
      let phaseStarted = Date.now();
      const data = Buffer.from(await response.arrayBuffer());
      network.bodyMs += Date.now() - phaseStarted;
      if (!data.length) throw new Error('Empty media');
      request.phase = 'write';
      phaseStarted = Date.now();
      const digest = sha256(data),
        path = resolve(directory, `${digest}.bin`);
      const pin = pinnedAssets.get(url);
      if (pin && (digest !== pin.sha256 || data.length !== pin.bytes))
        throw new Error('Pinned original video background evidence changed');
      const tmp = `${path}.${randomUUID()}.tmp`;
      await writeFile(tmp, data);
      try {
        await rename(tmp, path);
      } catch (error) {
        if (!(await valid({ sha256: digest, bytes: data.length }, path)))
          throw error;
        await rm(tmp, { force: true });
      }
      await writeJson(metadataPath, {
        sourceUrl: url,
        sha256: digest,
        bytes: data.length,
        path,
      });
      network.writeMs += Date.now() - phaseStarted;
      network.bytes += data.length;
      network.completed++;
      totals.downloaded++;
      return;
    } catch (error) {
      network.retries++;
      network.recentErrors.push({
        url,
        phase: request.phase,
        attempt,
        ms: Date.now() - started,
        error: error.message,
      });
      if (network.recentErrors.length > 16) network.recentErrors.shift();
      if (attempt === 5) {
        totals.failed++;
        failures.push({ url, error: error.message });
        return;
      }
      if (!error.rateLimited)
        await new Promise((done) =>
          setTimeout(done, Math.min(5000, 250 * 2 ** attempt)),
        );
    } finally {
      inFlight.delete(url);
    }
  }
}
// Native ending movies sometimes ship under a different filename. Resolve the
// complete original directory first and stage its XML through the same verified
// descriptor format that the offline publisher consumes.
const guessedMovieUrls = new Set(movieDirectories.values());
for (let i = queue.length - 1; i >= 0; i--)
  if (guessedMovieUrls.has(queue[i])) queue.splice(i, 1);
totals.total = queue.length + movieDirectories.size;
const movieQueue = [...movieDirectories];
const exactMovieUrls = new Set();
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (movieQueue.length) {
      const [name, defaultUrl] = movieQueue.shift();
      const prefix = `scenario/movie/${name}/`;
      const listingUrl = `${base}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
      await acquire(listingUrl, { listing: true });
      completed++;
      let metadata = existing[listingUrl],
        data;
      if (
        metadata?.sourceUrl === listingUrl &&
        metadata.url?.startsWith('/private/pjsk/assets/') &&
        !metadata.url.includes('..')
      ) {
        const path = resolve(pjskLibraryRoot, '.' + metadata.url);
        if (await valid(metadata, path)) data = await readFile(path);
      }
      if (!data) {
        metadata = JSON.parse(
          await readFile(
            resolve(directory, `${sha256(listingUrl)}.json`),
            'utf8',
          ),
        );
        if (
          metadata.sourceUrl !== listingUrl ||
          !(await valid(metadata, metadata.path))
        )
          throw new Error(`Invalid original movie listing: ${name}`);
        data = await readFile(metadata.path);
      }
      const page = parseVoiceListing(data.toString('utf8'));
      const movies = page.entries.filter(
        (entry) =>
          entry.key.startsWith(prefix) &&
          entry.key.endsWith('.mp4') &&
          !entry.key.slice(prefix.length).includes('/'),
      );
      if (page.continuation || movies.length !== 1)
        throw new Error(`Ambiguous original movie directory: ${name}`);
      const url = base + movies[0].key;
      exactMovieUrls.add(url);
      movieEvidence.push({
        name,
        url,
        defaultUrl,
        listingUrl,
        listingSha256: metadata.sha256,
        bytes: movies[0].bytes,
      });
      if (completed % 25 === 0) await checkpoint('discovering-movies');
    }
  }),
);
for (const url of exactMovieUrls)
  if (!queue.includes(url)) {
    queue.push(url);
    totals.total++;
  }
console.log(`Prefetch ${totals.total} distinct URLs with ${workers} workers`);
const activeWorkers = new Set();
function addWorkers(target) {
  while (workerCount < target && queue.length) {
    workerCount++;
    const operation = (async () => {
      while (queue.length) {
        const url = queue.shift();
        await acquire(url);
        completed++;
        if (completed % 100 === 0 || completed === totals.total) {
          console.log(JSON.stringify({ completed, ...totals }));
          await checkpoint('running');
        }
      }
    })();
    activeWorkers.add(operation);
    void operation
      .finally(() => activeWorkers.delete(operation))
      .catch(() => {});
  }
}
addWorkers(workers);
let controlTimer;
if (options['worker-control']) {
  const controlPath = resolve(root, options['worker-control']);
  controlTimer = setInterval(async () => {
    try {
      const { workers: target } = JSON.parse(
        await readFile(controlPath, 'utf8'),
      );
      if (Number.isInteger(target) && target > workerCount && target <= 64) {
        addWorkers(target);
        console.log(`Increased media workers to ${workerCount}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT')
        console.error(`Worker control: ${error.message}`);
    }
  }, 5000);
}
try {
  while (activeWorkers.size) await Promise.race([...activeWorkers]);
} finally {
  clearInterval(controlTimer);
}
await checkpoint('complete');
console.log(JSON.stringify(totals));
if (totals.failed || (options['skip-voices'] && totals.missing))
  process.exitCode = 1;
