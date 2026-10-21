import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pjskLibraryRoot } from './local-environment.mjs';
import {
  compilePjskEpisode,
  compilePjskDownloadText,
} from './pjsk-program.mjs';
import { decodeScenario, sha256 } from './pjsk-scenario.mjs';

// Maintainer-only: turn a reviewed local import into a pinned browser recipe.
// This ships URLs, checksums and model reference edits, never story/media bytes.
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const local = (url) => resolve(pjskLibraryRoot, '.' + url);
const episode = await read('src/generated/pjsk-cn-unit-30001.json');
const pkg = await read(
  '.cache/pjsk/packages/pjsk-cn-unit-30001-mmj_01_01.json',
);
const program = await read(local(episode.renderer.payload.url));
const sources = await read(local('/private/pjsk/sources.json'));
if (program.scenarioId !== 'mmj_01_01' || pkg.scenario.issues.length)
  throw new Error('Recipe requires the reviewed mmj_01_01 import.');
const models = [];
for (const [costume, model] of Object.entries(program.media.models)) {
  const candidates = Object.values(sources).filter(
    (file) =>
      file.sourceUrl?.includes(`/${costume}/`) &&
      file.sourceUrl.endsWith('.model3.json'),
  );
  if (candidates.length !== 1) throw new Error(`Ambiguous model: ${costume}`);
  const settings = await read(local(model.url));
  models.push({
    target: model.url,
    original: candidates[0].url,
    motions: settings.FileReferences.Motions,
  });
}
const scenario = pkg.report.sources.at(-1);
const compiled = compilePjskEpisode(
  {
    entry: pkg.entry,
    scenario: decodeScenario(pkg.scenario.source, pkg.entry.scenarioId),
    report: { sourceIdentity: { sourceSha256: scenario.sha256 } },
  },
  program.media,
);
const programHash = sha256(JSON.stringify(compiled));
const textHash = sha256(JSON.stringify(compilePjskDownloadText(compiled)));
const recipe = {
  version: 1,
  id: 'pjsk-mmj-01-01-v1',
  episode: { ...episode, acquisition: 'pjsk-mmj-01-01-v1' },
  entry: {
    id: pkg.entry.id,
    title: pkg.entry.title,
    region: pkg.entry.region,
    scenarioId: pkg.entry.scenarioId,
  },
  program: {
    url: `/private/pjsk/assets/${programHash}.json`,
    sha256: programHash,
  },
  text: { url: `/private/pjsk/assets/${textHash}.json`, sha256: textHash },
  scenario: {
    url: `/private/pjsk/assets/${scenario.sha256}.asset`,
    sourceUrl: scenario.url,
    sha256: scenario.sha256,
    bytes: scenario.byteLength,
  },
  media: program.media,
  models,
};
await mkdir('src/downloads', { recursive: true });
await writeFile(
  'src/downloads/pjsk-mmj-01-01.json',
  JSON.stringify(recipe, null, 2) + '\n',
);
console.log(
  `Pinned ${program.media.files.length} files for ${program.scenarioId}.`,
);
