// Repair maintainer-only prepared outputs from retained originals. The shipped
// recipes are immutable expectations: every compiled byte must match their hash.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pjskLibraryRoot } from './local-environment.mjs';
import {
  compilePjskEpisode,
  compilePjskDownloadText,
} from './pjsk-program.mjs';
import { withResolvedPjskMediaIssues } from './pjsk-media.mjs';
import { decodeScenario, sha256 } from './pjsk-scenario.mjs';
import { pjskInstallationFingerprint } from './pjsk-installation-provenance.mjs';

const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const local = (url) => resolve(pjskLibraryRoot, '.' + url);
const packages = fs.readdirSync('.cache/pjsk/packages');
const startedAt = new Date().toISOString();
const fingerprint = pjskInstallationFingerprint();
const episodes = [];
const evidencePath = 'docs/pjsk-prepared-restoration.json';
const prior = fs.existsSync(evidencePath) ? read(evidencePath) : null;
const history = prior
  ? [
      ...(prior.restorationRuns ?? [
        {
          startedAt: prior.startedAt,
          finishedAt: prior.finishedAt,
          restoredFiles: prior.restoredFiles,
        },
      ]),
    ]
  : [];
function compareLegacy(previous, current, path = '') {
  if (JSON.stringify(previous) === JSON.stringify(current)) return 0;
  if (previous === undefined && path.endsWith('.memory') && current === false)
    return 1;
  assert.ok(
    previous &&
      current &&
      typeof previous === 'object' &&
      typeof current === 'object',
    `Unexpected legacy change ${path}`,
  );
  let additions = 0;
  for (const key of new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ]))
    additions += compareLegacy(previous[key], current[key], `${path}.${key}`);
  return additions;
}
for (const item of read('src/downloads/pjsk-catalog.json')) {
  const episode = item.episode;
  if (episode.category !== 'Main story') continue;
  const original = read('src/generated/' + episode.id + '.json');
  const previous = read(local(original.renderer.payload.url));
  const packageName = packages.find((name) =>
    name.startsWith(episode.id + '-'),
  );
  assert.ok(packageName, episode.id);
  const pkg = read('.cache/pjsk/packages/' + packageName);
  const sourceHash = sha256(pkg.rawScenario);
  assert.equal(sourceHash, previous.sourceHash, episode.id);
  assert.equal(
    pkg.report.sourceIdentity?.sourceSha256 ?? pkg.report.sources.at(-1).sha256,
    sourceHash,
    episode.id,
  );
  const decoded = decodeScenario(
    JSON.parse(pkg.rawScenario),
    pkg.entry.scenarioId,
    {
      sourceScenarioId: pkg.report.sourceIdentity?.sourceScenarioId,
    },
  );
  assert.deepEqual(decoded, pkg.scenario, episode.id);
  const report = read(local(`/private/pjsk/${episode.id}-report.json`));
  const playback = withResolvedPjskMediaIssues(
    { ...pkg, scenario: decoded },
    report.corrections,
  );
  const program = compilePjskEpisode(
    { ...playback, report: { sourceIdentity: { sourceSha256: sourceHash } } },
    previous.media,
  );
  const addedMemoryFalseFields = compareLegacy(previous, program);
  const recipeBytes = fs.readFileSync(
    'src/downloads/pjsk-recipes/' + item.recipe,
  );
  assert.equal(sha256(recipeBytes), item.sha256, episode.id);
  assert.equal(recipeBytes.length, item.bytes, episode.id);
  const recipe = JSON.parse(gunzipSync(recipeBytes));
  assert.equal(recipe.scenario.sha256, sourceHash, episode.id);
  assert.deepEqual(recipe.media, program.media, episode.id);
  const programBytes = Buffer.from(JSON.stringify(program));
  const programUrl = `/private/pjsk/assets/${sha256(programBytes)}.json`;
  assert.equal(programUrl, recipe.program.url, episode.id);
  assert.equal(programUrl, episode.renderer.payload.url, episode.id);
  const textBytes = Buffer.from(
    JSON.stringify(compilePjskDownloadText(program, programUrl)),
  );
  const textUrl = `/private/pjsk/assets/${sha256(textBytes)}.json`;
  assert.equal(textUrl, recipe.text.url, episode.id);
  assert.equal(textUrl, episode.content.url, episode.id);
  const restored = [];
  for (const [url, bytes] of [
    [programUrl, programBytes],
    [textUrl, textBytes],
  ]) {
    const path = local(url);
    if (fs.existsSync(path))
      assert.ok(fs.readFileSync(path).equals(bytes), url);
    else {
      fs.writeFileSync(path, bytes);
      restored.push(url);
    }
  }
  episodes.push({
    id: episode.id,
    sourceSha256: sourceHash,
    recipeSha256: item.sha256,
    historicalProgram: original.renderer.payload.url,
    historicalText: original.content.url,
    addedMemoryFalseFields,
    program: programUrl,
    text: textUrl,
    restored,
  });
}
const manifest = read('docs/pjsk-main-corpus.json');
assert.equal(episodes.length, manifest.expectedEpisodeCount);
assert.deepEqual(pjskInstallationFingerprint(), fingerprint);
const evidence = {
  command: 'node scripts/restore-pjsk-prepared.mjs',
  startedAt,
  finishedAt: new Date().toISOString(),
  ...fingerprint,
  checkedEpisodes: episodes.length,
  restoredFiles: episodes.reduce(
    (n, episode) => n + episode.restored.length,
    0,
  ),
  legacyProgramComparison:
    'All historical program fields are identical except newly explicit memory:false in before/after/command state snapshots. Dialogue, IDs, commands and all other state/media fields are unchanged.',
  policy:
    'Authentic retained scenario bytes are re-decoded and compiled with reviewed media resolutions. Every output must match the existing pinned recipe and catalog URL exactly. No catalog, recipe or historical installation report is changed.',
  episodes,
};
evidence.restorationRuns = [
  ...history,
  {
    startedAt,
    finishedAt: evidence.finishedAt,
    restoredFiles: evidence.restoredFiles,
  },
];
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
console.log(
  `Verified ${episodes.length} main chapters; restored ${evidence.restoredFiles} prepared files.`,
);
