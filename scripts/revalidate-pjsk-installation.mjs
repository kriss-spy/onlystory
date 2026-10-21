// Reinstall retained originals offline into an isolated catalog, compare every
// output, and attest unchanged publications only after the entire run succeeds.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  installPjskEpisode,
  withResolvedPjskMediaIssues,
} from './pjsk-media.mjs';
import {
  compilePjskEpisode,
  compilePjskDownloadText,
} from './pjsk-program.mjs';
import { decodeScenario, sha256 } from './pjsk-scenario.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';
import { pjskInstallationFingerprint } from './pjsk-installation-provenance.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    scope: { type: 'string', default: 'all' },
    update: { type: 'boolean', default: false },
    'staged-installation': { type: 'string' },
    evidence: {
      type: 'string',
      default: 'docs/pjsk-installer-revalidation.json',
    },
  },
});
assert.ok(['all', 'events', 'main'].includes(values.scope));
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const portable = (path) => relative(root, path).replaceAll('\\', '/');
const fingerprint = pjskInstallationFingerprint(root);
const startedAt = new Date().toISOString();
const reuse = values['staged-installation'];
const staging = reuse
  ? resolve(root, reuse)
  : fs.mkdtempSync(resolve(root, '.cache/pjsk/revalidate-'));
assert.ok(portable(staging).startsWith('.cache/pjsk/revalidate-'));
const library = resolve(staging, 'library');
const generated = resolve(staging, 'generated');
const stageRoot = resolve(library, 'private/pjsk');
const originalRoot = resolve(pjskLibraryRoot, 'private/pjsk');
fs.mkdirSync(stageRoot, { recursive: true });
fs.mkdirSync(generated, { recursive: true });
// Content-addressed media are integrity checked by the actual offline installer.
// Catalogs, reports and source indexes are isolated from the active library.
for (const directory of reuse ? [] : ['assets', 'remote']) {
  const target = resolve(originalRoot, directory);
  if (fs.existsSync(target))
    fs.symlinkSync(target, resolve(stageRoot, directory), 'junction');
}
for (const filename of reuse ? [] : ['sources.json', 'deferred.json'])
  fs.copyFileSync(
    resolve(originalRoot, filename),
    resolve(stageRoot, filename),
  );
const definitions = [
  {
    scope: 'events',
    manifest: 'docs/pjsk-all-events.json',
    publication: '.cache/pjsk/all-events-validation/installation.json',
  },
  {
    scope: 'main',
    manifest: 'docs/pjsk-main-corpus.json',
    publication: '.cache/pjsk/main-validation/installation.json',
  },
].filter((item) => values.scope === 'all' || values.scope === item.scope);
const state = {};
const corpora = [];
const publications = [];
let completed = 0;
const log = console.log.bind(console);
const verifiedMedia = new Set();
for (const definition of definitions) {
  const manifest = read(resolve(root, definition.manifest));
  const publicationPath = resolve(root, definition.publication);
  const originalPublication = fs.readFileSync(publicationPath);
  const publication = JSON.parse(originalPublication);
  assert.ok(publication.finishedAt);
  assert.equal(publication.failed, 0);
  const episodes = [];
  let unavailable = 0;
  for (const entry of manifest.events.flatMap((event) => event.episodes)) {
    const previous = publication.episodes[entry.id];
    assert.ok(previous, `Publication omits ${entry.id}`);
    if (previous.status === 'source-unavailable') {
      unavailable++;
      continue;
    }
    assert.equal(previous.status, 'installed', entry.id);
    const packagePath = resolve(
      root,
      `.cache/pjsk/packages/${entry.id}-${entry.scenarioId}.json`,
    );
    const pkg = read(packagePath);
    assert.equal(pkg.entry.id, entry.id);
    assert.equal(pkg.entry.path, entry.path);
    const sourceHash = sha256(pkg.rawScenario);
    assert.equal(previous.sourceHash, sourceHash, entry.id);
    assert.equal(
      pkg.report.sourceIdentity?.sourceSha256 ??
        pkg.report.sources.at(-1).sha256,
      sourceHash,
      entry.id,
    );
    const decoded = decodeScenario(
      JSON.parse(pkg.rawScenario),
      entry.scenarioId,
      {
        sourceScenarioId: pkg.report.sourceIdentity?.sourceScenarioId,
      },
    );
    assert.deepEqual(decoded, pkg.scenario, `${entry.id} native source decode`);
    const originalCatalog = fs.readFileSync(
      resolve(root, `src/generated/${entry.id}.json`),
    );
    const episode = JSON.parse(originalCatalog);
    const originalProgram = fs.readFileSync(
      resolve(pjskLibraryRoot, '.' + episode.renderer.payload.url),
    );
    const originalText = fs.readFileSync(
      resolve(pjskLibraryRoot, '.' + episode.content.url),
    );
    let installed;
    try {
      console.log = () => {};
      if (!reuse) {
        installed = await installPjskEpisode(
          { ...pkg, scenario: decoded },
          {
            libraryDir: library,
            generatedDir: generated,
            offline: true,
            state,
          },
        );
      } else {
        // Recheck a completed isolated installation without replaying acquisition.
        // Compilation still runs from authenticated original scenario bytes;
        // staged reports and every present native-media hash are checked again.
        const staged = read(resolve(generated, entry.id + '.json'));
        const report = read(resolve(stageRoot, entry.id + '-report.json'));
        assert.equal(report.playbackReady, true, entry.id);
        assert.deepEqual(report.source, pkg.report, entry.id);
        const stagedProgramBytes = fs.readFileSync(
          resolve(library, '.' + staged.renderer.payload.url),
        );
        const stagedProgram = JSON.parse(stagedProgramBytes);
        const playback = withResolvedPjskMediaIssues(
          { ...pkg, scenario: decoded },
          report.corrections,
        );
        const currentProgram = compilePjskEpisode(
          playback,
          stagedProgram.media,
        );
        assert.equal(
          JSON.stringify(currentProgram),
          stagedProgramBytes.toString(),
          `${entry.id} current program compilation`,
        );
        const stagedTextBytes = fs.readFileSync(
          resolve(library, '.' + staged.content.url),
        );
        assert.equal(
          JSON.stringify(
            compilePjskDownloadText(
              currentProgram,
              staged.renderer.payload.url,
            ),
          ),
          stagedTextBytes.toString(),
          `${entry.id} current text compilation`,
        );
        for (const file of report.files) {
          if (file.deferred || verifiedMedia.has(file.url)) continue;
          const bytes = fs.readFileSync(resolve(library, '.' + file.url));
          assert.equal(bytes.length, file.bytes, file.url);
          assert.equal(sha256(bytes), file.sha256, file.url);
          verifiedMedia.add(file.url);
        }
        installed = {
          program: staged.renderer.payload.url,
          passages: staged.content.count,
          files: report.files.length + 1,
        };
      }
    } finally {
      console.log = log;
    }
    const rebuiltCatalog = fs.readFileSync(
      resolve(generated, entry.id + '.json'),
    );
    const rebuiltEpisode = JSON.parse(rebuiltCatalog);
    assert.ok(
      originalCatalog.equals(rebuiltCatalog),
      `${entry.id} catalog changed`,
    );
    assert.equal(
      installed.program,
      episode.renderer.payload.url,
      `${entry.id} program URL`,
    );
    assert.equal(
      rebuiltEpisode.content.url,
      episode.content.url,
      `${entry.id} text URL`,
    );
    assert.equal(
      sha256(originalProgram),
      /\/([a-f0-9]{64})\.json$/.exec(installed.program)?.[1],
    );
    assert.equal(
      sha256(originalText),
      /\/([a-f0-9]{64})\.json$/.exec(episode.content.url)?.[1],
    );
    episodes.push({
      id: entry.id,
      sourceHash,
      packageSha256: sha256(fs.readFileSync(packagePath)),
      previousImplementationHash: previous.implementationHash,
      program: installed.program,
      programSha256: sha256(originalProgram),
      text: episode.content.url,
      textSha256: sha256(originalText),
      catalogSha256: sha256(originalCatalog),
      passages: installed.passages,
      files: installed.files,
    });
    completed++;
    if (completed % 25 === 0)
      log(`Revalidated ${completed} unchanged PJSK episodes`);
  }
  assert.equal(episodes.length, publication.installed);
  assert.equal(unavailable, publication.unavailable ?? 0);
  assert.equal(episodes.length + unavailable, manifest.expectedEpisodeCount);
  corpora.push({
    ...definition,
    originalPublicationSha256: sha256(originalPublication),
    originalImplementationHash: publication.implementationHash,
    originalStartedAt: publication.startedAt,
    originalFinishedAt: publication.finishedAt,
    installed: episodes.length,
    unavailable,
    episodes,
  });
  publications.push({ publicationPath, publication, originalPublication });
}
assert.deepEqual(
  pjskInstallationFingerprint(root),
  fingerprint,
  'Compiler changed during validation',
);
const finishedAt = new Date().toISOString();
const evidence = {
  mode: reuse
    ? 'retained-source-recompile-and-staged-offline-installation-byte-identical'
    : 'offline-reinstall-byte-identical',
  command: `node scripts/revalidate-pjsk-installation.mjs --scope ${values.scope}${reuse ? ` --staged-installation ${portable(staging)}` : ''}${values.update ? ' --update' : ''}`,
  startedAt,
  finishedAt,
  ...fingerprint,
  staging: portable(staging),
  checkedEpisodes: completed,
  outputChanges: 0,
  sourcePolicy: reuse
    ? 'Recheck the completed isolated offline installation, authenticate retained original packages, decode and compile every program/text again, validate staged source reports and all present native-media hashes, then compare full catalog/program/text identities. Deferred voices retain their original pinned source descriptors.'
    : 'Retained original packages, current decoder, current full media installer and reviewed resolutions; offline only. Program, text and catalog identities must all remain byte identical.',
  ...(reuse ? { checkedPresentMediaFiles: verifiedMedia.size } : {}),
  corpora,
};
const evidencePath = resolve(root, values.evidence);
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
const evidenceSha256 = sha256(fs.readFileSync(evidencePath));
if (values.update) {
  for (const { publicationPath, originalPublication } of publications)
    assert.equal(
      sha256(fs.readFileSync(publicationPath)),
      sha256(originalPublication),
      'Publication changed during validation',
    );
  for (const {
    publicationPath,
    publication,
    originalPublication,
  } of publications) {
    const history = resolve(publicationPath, '..', 'installation-history');
    fs.mkdirSync(history, { recursive: true });
    const snapshot = resolve(history, sha256(originalPublication) + '.json');
    if (!fs.existsSync(snapshot))
      fs.writeFileSync(snapshot, originalPublication);
    assert.equal(
      sha256(fs.readFileSync(snapshot)),
      sha256(originalPublication),
    );
    publication.publishedImplementationHash ??= publication.implementationHash;
    Object.assign(publication, fingerprint);
    publication.revalidation = {
      mode: evidence.mode,
      finishedAt,
      evidence: portable(evidencePath),
      evidenceSha256,
      historicalPublication: portable(snapshot),
      historicalPublicationSha256: sha256(originalPublication),
    };
    for (const episode of Object.values(publication.episodes)) {
      if (episode.status !== 'installed') continue;
      episode.publishedImplementationHash ??= episode.implementationHash;
      episode.implementationHash = fingerprint.implementationHash;
      episode.revalidatedAt = finishedAt;
    }
    fs.writeFileSync(
      publicationPath,
      JSON.stringify(publication, null, 2) + '\n',
    );
  }
}
log(
  `Revalidated ${completed} PJSK episodes offline with no program, text or catalog changes. Evidence: ${portable(evidencePath)}`,
);
