import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256 } from './pjsk-scenario.mjs';
import { collectPjskCostumes } from './pjsk-program.mjs';
import {
  reviewedMotionOwners,
  reviewedAbsentModelMetadata,
} from './pjsk-model-overrides.mjs';
import { writeJson } from './pjsk-import.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values: options } = parseArgs({
  options: {
    manifest: { type: 'string' },
    report: { type: 'string' },
    workers: { type: 'string' },
    'allow-missing-packages': { type: 'boolean' },
  },
});
const workers = Number(options.workers ?? 12);
if (!Number.isInteger(workers) || workers < 1 || workers > 32)
  throw new Error('Prefetch workers must be between 1 and 32.');
const directory = resolve(root, '.cache/pjsk/prefetch');
await mkdir(directory, { recursive: true });
let existing = {};
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
const totals = { downloaded: 0, cached: 0, missing: 0, failed: 0, models: 0 };
const pending = new Map(),
  waiters = [];
let active = 0;
let cooldownUntil = 0;
async function checked(record, path) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.sha256)) return null;
  try {
    const data = await readFile(path);
    return data.length === record.bytes && sha256(data) === record.sha256
      ? data
      : null;
  } catch {
    return null;
  }
}
async function cached(url) {
  const r = existing[url];
  if (
    r?.sourceUrl === url &&
    r.url?.startsWith('/private/pjsk/assets/') &&
    !r.url.includes('..')
  ) {
    const data = await checked(r, resolve(pjskLibraryRoot, '.' + r.url));
    if (data) return { data, sourceUrl: url };
  }
  try {
    const r = JSON.parse(
      await readFile(resolve(directory, sha256(url) + '.json'), 'utf8'),
    );
    const data = r.sourceUrl === url ? await checked(r, r.path) : null;
    if (data) return { data, sourceUrl: url };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return null;
}
function get(url) {
  if (pending.has(url)) return pending.get(url);
  const promise = (async () => {
    const prior = await cached(url);
    if (prior) {
      totals.cached++;
      return prior;
    }
    if (active >= workers) await new Promise((done) => waiters.push(done));
    else active++;
    try {
      for (let attempt = 0; attempt < 8; attempt++)
        try {
          while (Date.now() < cooldownUntil)
            await new Promise((done) =>
              setTimeout(done, Math.min(1000, cooldownUntil - Date.now())),
            );
          const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (r.status === 429) {
            const retry = Number(r.headers.get('retry-after'));
            cooldownUntil = Math.max(
              cooldownUntil,
              Date.now() +
                Math.min(
                  120000,
                  Math.max(
                    5000,
                    Number.isFinite(retry) && retry > 0
                      ? retry * 1000
                      : 5000 * 2 ** attempt,
                  ),
                ),
            );
            throw new Error('HTTP 429 ' + url);
          }
          if (r.status === 404) {
            const error = new Error('HTTP 404 ' + url);
            error.status = 404;
            throw error;
          }
          if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
          if (/text\/html|xml/.test(r.headers.get('content-type') ?? ''))
            throw new Error('Unexpected error document ' + url);
          const data = Buffer.from(await r.arrayBuffer());
          if (!data.length) throw new Error('Empty media ' + url);
          const digest = sha256(data),
            path = resolve(directory, digest + '.bin'),
            tmp = path + '.' + randomUUID() + '.tmp';
          await writeFile(tmp, data);
          try {
            await rename(tmp, path);
          } catch (error) {
            if (!(await checked({ sha256: digest, bytes: data.length }, path)))
              throw error;
            await rm(tmp, { force: true });
          }
          await writeJson(resolve(directory, sha256(url) + '.json'), {
            sourceUrl: url,
            sha256: digest,
            bytes: data.length,
            path,
          });
          totals.downloaded++;
          if (totals.downloaded % 100 === 0)
            console.log(JSON.stringify(totals));
          return { data, sourceUrl: url };
        } catch (error) {
          if (error.status === 404) {
            totals.missing++;
            throw error;
          }
          if (attempt === 7) {
            totals.failed++;
            throw error;
          }
        }
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active--;
    }
  })();
  pending.set(url, promise);
  void promise.finally(() => pending.delete(url)).catch(() => {});
  return promise;
}
async function fallback(urls) {
  // A cached generic owner must not outrank an available exact costume URL.
  // Child/teen models can share body names but have distinct facial tracks.
  for (const [i, url] of urls.entries())
    try {
      return await get(url);
    } catch (error) {
      if (error.status !== 404 || i === urls.length - 1) throw error;
    }
}
const manifest = JSON.parse(
  await readFile(
    resolve(root, options.manifest ?? 'docs/pjsk-validation-corpus.json'),
    'utf8',
  ),
);
const costumes = new Map();
const episodes = (manifest.groups ?? manifest.events).flatMap(
  (group) => group.episodes,
);
const missingPackages = [];
for (const ep of episodes) {
  let pkg;
  try {
    pkg = JSON.parse(
      await readFile(
        resolve(root, '.cache/pjsk/packages', `${ep.id}-${ep.scenarioId}.json`),
        'utf8',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT' || !options['allow-missing-packages'])
      throw error;
    missingPackages.push(ep.id);
    continue;
  }
  const source = pkg.scenario.source;
  for (const [costume, required] of collectPjskCostumes(source)) {
    if (!costumes.has(costume))
      costumes.set(costume, { motions: new Set(), facial: new Set() });
    const names = costumes.get(costume);
    for (const name of required.motions) names.motions.add(name);
    for (const name of required.expressions) names.facial.add(name);
  }
}
const base = 'https://storage.sekai.best/sekai-live2d-assets/';
const models = JSON.parse((await get(base + 'live2d/model_list.json')).data);
console.log(
  `Prefetch ${costumes.size} unique costumes with ${workers} network workers`,
);
const queue = [...costumes],
  failures = [];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const [costume, names] = queue.shift();
      try {
        const model = models.find((m) => m.modelBase === costume);
        if (!model) throw new Error('No model metadata ' + costume);
        const modelBase = base + `live2d/model/${model.modelPath}/`;
        const settings = JSON.parse(
            (await get(modelBase + model.modelFile)).data,
          ),
          refs = settings.FileReferences;
        await Promise.all(
          [
            ...['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData']
              .filter(
                (k) =>
                  refs[k] &&
                  reviewedAbsentModelMetadata[costume]?.[k]?.reference !==
                    refs[k],
              )
              .map((k) => refs[k]),
            ...refs.Textures,
          ].map((file) =>
            fallback([modelBase + file, (modelBase + file).toLowerCase()]),
          ),
        );
        const motionDir = model.modelPath.split('/').slice(0, -1).join('/');
        const candidates = [];
        // Back-facing costumes share the separately listed character back rig.
        if (/^v2_(19ena|20mizuki)_(culture|school)_back$/.test(costume))
          candidates.push(
            `${base}live2d/motion/v2/sub/${costume.replace(/_(culture|school)_back$/, '_back')}_motion_base/BuildMotionData.json`,
          );
        for (
          let name = model.modelBase;
          name;
          name = name.includes('_') ? name.slice(0, name.lastIndexOf('_')) : ''
        )
          candidates.push(
            `${base}live2d/motion/${motionDir}/${name}_motion_base/BuildMotionData.json`,
          );
        const reviewedBases = reviewedMotionOwners[costume]?.bases ?? [];
        candidates.push(
          ...reviewedBases.map((base) => base + 'BuildMotionData.json'),
        );
        const motionFile =
            names.motions.size || names.facial.size
              ? await fallback(candidates)
              : null,
          motionBase =
            motionFile?.sourceUrl.slice(0, -'BuildMotionData.json'.length) ??
            '';
        await Promise.all(
          [
            ['motion', names.motions],
            ['facial', names.facial],
          ].flatMap(([folder, set]) =>
            [...set].map((name) => {
              const path = `${motionBase}${folder}/${encodeURIComponent(name)}.motion3.json`,
                normalized = name.replaceAll(' ', '');
              return fallback([
                path,
                path.toLowerCase(),
                `${modelBase}motions/${encodeURIComponent(name)}.motion3.json`,
                ...(normalized !== name
                  ? [`${motionBase}${folder}/${normalized}.motion3.json`]
                  : []),
                // The source explicitly asks Len for this Tsukasa-named track.
                // Its original owner URL is verified; retain the exact motion.
                ...(name === 'm-tsukasa-angry02'
                  ? [
                      `${base}live2d/motion/v1/main/13_tsukasa/13tsukasa_motion_base/motion/${name}.motion3.json`,
                    ]
                  : []),
                ...reviewedBases.map(
                  (base) =>
                    `${base}${folder}/${encodeURIComponent(name)}.motion3.json`,
                ),
              ]);
            }),
          ),
        );
        totals.models++;
        console.log(`Model ${totals.models}/${costumes.size} ${costume}`);
      } catch (error) {
        failures.push({ costume, error: error.message });
        console.log(`Model failed ${costume}: ${error.message}`);
      }
    }
  }),
);
await writeJson(resolve(directory, options.report ?? 'models-report.json'), {
  ...totals,
  complete: missingPackages.length === 0 && failures.length === 0,
  expectedEpisodes: episodes.length,
  acquiredEpisodes: episodes.length - missingPackages.length,
  missingPackages,
  expectedModels: costumes.size,
  failures,
});
console.log(JSON.stringify({ ...totals, modelFailures: failures.length }));
if (failures.length) process.exitCode = 1;
