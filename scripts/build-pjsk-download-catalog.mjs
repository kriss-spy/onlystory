import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pjskLibraryRoot } from './local-environment.mjs';
import {
  compilePjskEpisode,
  compilePjskDownloadText,
} from './pjsk-program.mjs';
import { decodeScenario, sha256 } from './pjsk-scenario.mjs';
import { withResolvedPjskMediaIssues } from './pjsk-media.mjs';

// Maintainer build: dependency descriptors and edits only. No dialogue, images,
// audio, model binaries or motion bodies are shipped with the application.
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const local = (url) => path.join(pjskLibraryRoot, url);
const sources = Object.values(read(local('/private/pjsk/sources.json')));
const originals = sources.filter((f) => f.sourceUrl.endsWith('.model3.json'));
const modelCache = new Map();
function modelRecipe(costume, target) {
  if (modelCache.has(target)) return modelCache.get(target);
  const settings = read(local(target));
  const candidates = originals.filter((f) =>
    f.sourceUrl.includes(`/${costume}/`),
  );
  const matches = candidates.filter((file) => {
    const original = read(local(file.url));
    return (
      sha256(
        JSON.stringify({
          ...original,
          FileReferences: settings.FileReferences,
        }),
      ) === sha256(JSON.stringify(settings))
    );
  });
  if (matches.length !== 1)
    throw Error(
      `Cannot identify original model ${costume}: ${matches.length} matches`,
    );
  const recipe = {
    target,
    original: matches[0].url,
    references: settings.FileReferences,
  };
  modelCache.set(target, recipe);
  return recipe;
}
const output = 'src/downloads/pjsk-recipes';
fs.mkdirSync(output, { recursive: true });
const catalog = [],
  report = {
    chapters: 0,
    main: 0,
    events: 0,
    choices: [],
    videos: [],
    models: 0,
    deferredVoices: 0,
    recipeBytes: 0,
    refreshedPrograms: [],
  };
// Episode IDs contain an additional numeric suffix; resolve through package entries.
const packageNames = fs
  .readdirSync('.cache/pjsk/packages')
  .filter((f) => f.endsWith('.json'));
const sourceFiles = new Map(sources.map((f) => [f.url, f]));
for (const name of fs
  .readdirSync('src/generated')
  .filter((f) => /^pjsk-.*\.json$/.test(f))
  .sort()) {
  const episode = read('src/generated/' + name);
  const program = read(local(episode.renderer.payload.url));
  const packageName = packageNames.find((f) => f.startsWith(episode.id + '-'));
  if (!packageName) throw Error(`Missing source package ${episode.id}`);
  const pkg = read('.cache/pjsk/packages/' + packageName);
  const importReport = read(local(`/private/pjsk/${episode.id}-report.json`));
  const scenario = pkg.report.sources.findLast(
    (f) => f.sha256 === program.sourceHash,
  );
  if (!scenario)
    throw Error(`Missing original scenario descriptor ${episode.id}`);
  const sourceScenarioId = pkg.report.sourceIdentity?.sourceScenarioId;
  const playback = withResolvedPjskMediaIssues(
    {
      ...pkg,
      scenario: decodeScenario(pkg.scenario.source, pkg.entry.scenarioId, {
        sourceScenarioId,
      }),
    },
    importReport.corrections,
  );
  const compiled = compilePjskEpisode(
    {
      ...playback,
      report: { sourceIdentity: { sourceSha256: program.sourceHash } },
    },
    program.media,
  );
  const programUrl = `/private/pjsk/assets/${sha256(JSON.stringify(compiled))}.json`;
  if (programUrl !== episode.renderer.payload.url) {
    const dialogue = (p) =>
      p.steps.map(({ id, kind, speaker, text }) => ({
        id,
        kind,
        speaker,
        text,
      }));
    if (
      JSON.stringify(dialogue(compiled)) !== JSON.stringify(dialogue(program))
    )
      throw Error(`Passages differ for ${episode.id}`);
    report.refreshedPrograms.push(episode.id);
  }
  const text = compilePjskDownloadText(compiled, programUrl);
  const textUrl = `/private/pjsk/assets/${sha256(JSON.stringify(text))}.json`;
  if (
    programUrl === episode.renderer.payload.url &&
    textUrl !== episode.content.url
  )
    throw Error(`Text differs for ${episode.id}`);
  const models = Object.entries(program.media.models).map(([costume, model]) =>
    modelRecipe(costume, model.url),
  );
  for (const file of program.media.files.filter((f) => !f.sourceUrl)) {
    if (!models.some((m) => m.target === file.url))
      throw Error(`Unimplemented generated asset ${file.url}`);
  }
  const issueResolutions = importReport.corrections
    .filter(
      (c) =>
        c.evidence?.bytes > 0 &&
        (/^[a-f0-9]{64}$/.test(c.evidence.sha256) ||
          (/^[a-f0-9]{32}$/.test(c.evidence.md5) &&
            /^[a-f0-9]{64}$/.test(c.evidence.listing?.sha256))),
    )
    .map((c) => ({
      kind: c.kind,
      reference: c.originalReference,
      locations: c.locations,
    }));
  const id = episode.id + '-download-v1';
  const entry = {
    id: pkg.entry.id,
    title: pkg.entry.title,
    region: pkg.entry.region,
    scenarioId: pkg.entry.scenarioId,
  };
  const recipe = {
    version: 2,
    id,
    entry,
    ...(sourceScenarioId ? { sourceScenarioId } : {}),
    scenario: {
      url: `/private/pjsk/assets/${scenario.sha256}.asset`,
      sourceUrl: scenario.url,
      sha256: scenario.sha256,
      bytes: scenario.byteLength,
    },
    program: { url: programUrl },
    text: { url: textUrl },
    media: program.media,
    models,
    issueResolutions,
    extraFiles: models
      .map((m) => sourceFiles.get(m.original))
      .filter((f) => !program.media.files.some((p) => p.url === f.url)),
  };
  const compressed = gzipSync(JSON.stringify(recipe), { level: 9, mtime: 0 });
  const recipePath = `${episode.id}.json.gz`;
  fs.writeFileSync(path.join(output, recipePath), compressed);
  const files = [
    recipe.scenario,
    ...recipe.media.files.filter((f) => f.sourceUrl),
    ...recipe.extraFiles,
  ];
  catalog.push({
    episode: {
      ...episode,
      acquisition: id,
      assets: episode.assets.map((url) =>
        url === episode.content.url ? textUrl : url,
      ),
      content: { ...episode.content, url: textUrl },
      renderer: { ...episode.renderer, payload: { url: programUrl } },
    },
    recipe: recipePath,
    sha256: sha256(compressed),
    bytes: compressed.length,
    downloadBytes: files.reduce((n, f) => n + f.bytes, 0),
  });
  report.chapters++;
  report[episode.category === 'Main story' ? 'main' : 'events']++;
  report.models += models.length;
  report.deferredVoices += program.media.files.filter((f) => f.deferred).length;
  report.recipeBytes += compressed.length;
  if (program.steps.some((s) => s.kind === 'choice'))
    report.choices.push(episode.id);
  if (program.steps.some((s) => s.kind === 'video'))
    report.videos.push(episode.id);
  if (catalog.length % 100 === 0)
    console.log(`Prepared ${catalog.length} chapter recipes`);
}
fs.writeFileSync(
  'src/downloads/pjsk-catalog.json',
  JSON.stringify(catalog) + '\n',
);
fs.writeFileSync(
  'docs/pjsk-download-catalog.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(report);
