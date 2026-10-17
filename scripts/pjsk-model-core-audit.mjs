import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { sha256 } from './pjsk-scenario.mjs';
import { collectPjskCostumes } from './pjsk-program.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';

// Offline SDK compatibility audit. Run with --expose-gc for comparable heap
// samples. This reads checksum-verified original files and never publishes them.
const reportPath = resolve(
  '.cache/pjsk/all-events-validation/model-core-audit.json',
);
const startedAt = new Date().toISOString();
const corpus = JSON.parse(await readFile('docs/pjsk-all-events.json', 'utf8'));
const availability = JSON.parse(
  await readFile('.cache/pjsk/all-events-validation/availability.json', 'utf8'),
);
const unavailable = new Set(availability.events.map((event) => event.eventId));
const episodes = corpus.events
  .filter((event) => !unavailable.has(event.eventId))
  .flatMap((event) => event.episodes);
assert.equal(episodes.length, availability.availableEpisodes);
const costumes = new Map();
for (const episode of episodes) {
  const pkg = JSON.parse(
    await readFile(
      `.cache/pjsk/packages/${episode.id}-${episode.scenarioId}.json`,
      'utf8',
    ),
  );
  for (const [costume] of collectPjskCostumes(pkg.scenario.source)) {
    if (!costumes.has(costume)) costumes.set(costume, []);
    costumes.get(costume).push(episode.scenarioId);
  }
}
const sources = JSON.parse(
  await readFile(resolve(pjskLibraryRoot, 'private/pjsk/sources.json'), 'utf8'),
);
async function original(sourceUrl) {
  const stagedPath = resolve(
    '.cache/pjsk/prefetch',
    sha256(sourceUrl) + '.json',
  );
  const candidates = [];
  if (sources[sourceUrl]?.url?.startsWith('/private/pjsk/assets/'))
    candidates.push({
      ...sources[sourceUrl],
      path: resolve(pjskLibraryRoot, '.' + sources[sourceUrl].url),
    });
  try {
    candidates.push(JSON.parse(await readFile(stagedPath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const candidate of candidates) {
    if (candidate.sourceUrl !== sourceUrl) continue;
    let bytes;
    try {
      bytes = await readFile(candidate.path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (bytes.length !== candidate.bytes || sha256(bytes) !== candidate.sha256)
      continue;
    return {
      bytes,
      evidence: { sourceUrl, sha256: candidate.sha256, bytes: bytes.length },
    };
  }
  throw new Error('No checksum-verified original cached asset: ' + sourceUrl);
}
const base = 'https://storage.sekai.best/sekai-live2d-assets/live2d/';
const listAsset = await original(base + 'model_list.json');
const models = JSON.parse(listAsset.bytes);
const sdkPath = resolve('public/vendor/live2dcubismcore.min.js');
const sdkBytes = await readFile(sdkPath);
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve('public/vendor');
vm.runInThisContext(sdkBytes.toString(), {
  filename: 'live2dcubismcore.min.js',
});
await new Promise((resolve) => setTimeout(resolve, 100));
const core = globalThis.Live2DCubismCore;
const memorySamples = [];
const records = [];
const wasmHeapCapacities = new Set();
const sample = (completed) => {
  globalThis.gc?.();
  memorySamples.push({ completed, ...process.memoryUsage() });
};
sample(0);
function finite(values, label) {
  for (let index = 0; index < values.length; index++)
    assert.ok(
      Number.isFinite(values[index]),
      `${label}[${index}] is not finite`,
    );
}
async function save(complete) {
  const errors = records.filter((record) => record.error);
  const report = {
    startedAt,
    checkedAt: new Date().toISOString(),
    complete,
    expectedEpisodes: episodes.length,
    expectedCostumes: costumes.size,
    checked: records.length,
    passed: records.length - errors.length,
    failed: errors.length,
    sdk: {
      path: sdkPath,
      sha256: sha256(sdkBytes),
      version: core.Version.csmGetVersion(),
      latestMocVersion: core.Version.csmGetLatestMocVersion(),
    },
    modelList: listAsset.evidence,
    memory: {
      explicitGc: typeof globalThis.gc === 'function',
      samples: memorySamples,
      wasmHeapCapacities: [...wasmHeapCapacities],
      peakRss: Math.max(...memorySamples.map((row) => row.rss)),
      heapUsedChange: memorySamples.at(-1).heapUsed - memorySamples[0].heapUsed,
      note: 'Each model and MOC is released in finally; SDK WASM heap capacity may retain its high-water allocation. Node GC samples do not measure live WASM allocations.',
    },
    records,
  };
  await mkdir(resolve('.cache/pjsk/all-events-validation'), {
    recursive: true,
  });
  await writeFile(reportPath + '.tmp', JSON.stringify(report, null, 2) + '\n');
  await rename(reportPath + '.tmp', reportPath);
}
for (const [costume, scenarios] of [...costumes].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  let moc, model;
  const record = { costume, scenarios };
  try {
    const metadata = models.find((row) => row.modelBase === costume);
    assert.ok(metadata, 'Missing original model metadata');
    const root = base + 'model/' + metadata.modelPath + '/';
    const settings = await original(root + metadata.modelFile);
    const refs = JSON.parse(settings.bytes).FileReferences;
    // The source cache preserves the original literal filename, including
    // Minori's full-width letter. URL serialization changes its cache key.
    const asset = await original(
      /^https?:/.test(refs.Moc) ? refs.Moc : root + refs.Moc,
    );
    record.settings = settings.evidence;
    record.moc = asset.evidence;
    const bytes = asset.bytes;
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    moc = core.Moc.fromArrayBuffer(buffer);
    assert.ok(moc, 'SDK rejected MOC');
    record.mocVersion = core.Version.csmGetMocVersion(moc, buffer);
    assert.ok(
      record.mocVersion > 0 &&
        record.mocVersion <= core.Version.csmGetLatestMocVersion(),
      'Unsupported MOC version',
    );
    record.consistent = !!moc.hasMocConsistency(buffer);
    assert.ok(record.consistent, 'SDK MOC consistency check failed');
    model = core.Model.fromMoc(moc);
    assert.ok(model, 'SDK model construction failed');
    const parameters = model.parameters;
    record.parameters = parameters.ids.length;
    record.drawables = model.drawables.ids.length;
    assert.ok(
      record.parameters > 0 && record.drawables > 0,
      'Empty parameters or drawables',
    );
    for (const key of [
      'values',
      'minimumValues',
      'maximumValues',
      'defaultValues',
    ])
      finite(parameters[key], key);
    for (let i = 0; i < record.parameters; i++) {
      assert.ok(
        parameters.minimumValues[i] <= parameters.maximumValues[i],
        `Invalid range: ${parameters.ids[i]}`,
      );
      assert.ok(
        parameters.defaultValues[i] >= parameters.minimumValues[i] - 1e-6 &&
          parameters.defaultValues[i] <= parameters.maximumValues[i] + 1e-6,
        `Default outside range: ${parameters.ids[i]}`,
      );
    }
    record.vertexBuffers = model.drawables.vertexPositions.length;
    record.vertexCoordinates = 0;
    for (const [index, vertices] of model.drawables.vertexPositions.entries()) {
      finite(vertices, `initial vertices ${index}`);
      record.vertexCoordinates += vertices.length;
      wasmHeapCapacities.add(vertices.buffer.byteLength);
    }
    for (const [index, uv] of model.drawables.vertexUvs.entries())
      finite(uv, `UV ${index}`);
    model.update();
    for (const [index, vertices] of model.drawables.vertexPositions.entries())
      finite(vertices, `updated vertices ${index}`);
    finite(model.drawables.opacities, 'drawable opacity');
    for (const key of ['CanvasWidth', 'CanvasHeight', 'PixelsPerUnit'])
      if (model.canvasinfo[key] !== undefined)
        assert.ok(
          Number.isFinite(model.canvasinfo[key]) && model.canvasinfo[key] > 0,
          'Invalid canvas ' + key,
        );
  } catch (error) {
    record.error = error.message;
  } finally {
    model?.release();
    moc?._release();
  }
  records.push(record);
  if (records.length % 25 === 0 || record.error) {
    sample(records.length);
    await save(false);
    console.log(
      `Core audit ${records.length}/${costumes.size}; failures ${records.filter((record) => record.error).length}`,
    );
  }
}
sample(records.length);
await save(true);
console.log(
  JSON.stringify({
    checked: records.length,
    failed: records.filter((record) => record.error).length,
    reportPath,
  }),
);
if (records.some((record) => record.error)) process.exitCode = 1;
