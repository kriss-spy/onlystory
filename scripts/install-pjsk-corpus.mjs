import { parseArgs } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPjskEpisode } from './pjsk-media.mjs';
import { writeJson } from './pjsk-import.mjs';
import { sha256 } from './pjsk-scenario.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    offline: { type: 'boolean' },
    resume: { type: 'boolean' },
    'availability-report': { type: 'string' },
    events: { type: 'string' },
    episodes: { type: 'string' },
    manifest: { type: 'string', default: 'docs/pjsk-validation-corpus.json' },
    report: { type: 'string', default: '.cache/pjsk/validation' },
  },
});
const corpus = JSON.parse(await readFile(resolve(root, values.manifest)));
const unavailable = new Map(
  values['availability-report']
    ? JSON.parse(
        await readFile(resolve(root, values['availability-report'])),
      ).events.map((event) => [event.eventId, event])
    : [],
);
const output = resolve(root, values.report);
await mkdir(output, { recursive: true });
const reportPath = resolve(output, 'installation.json');
const implementationHash = sha256(
  Buffer.concat([
    ...(await Promise.all(
      [
        'pjsk-media.mjs',
        'pjsk-program.mjs',
        'pjsk-scenario.mjs',
        'pjsk-import.mjs',
        'pjsk-voice-listing.mjs',
        'pjsk-voice-bindings.mjs',
        'pjsk-model-overrides.mjs',
      ].map((name) => readFile(resolve(root, 'scripts', name))),
    )),
    await readFile(resolve(root, 'docs/pjsk-model-overrides.json')),
    await readFile(resolve(root, 'docs/pjsk-video-backgrounds.json')),
    await readFile(resolve(root, 'docs/pjsk-voice-bindings.json')),
  ]),
);
let previous = {};
if (values.resume) {
  try {
    previous = JSON.parse(await readFile(reportPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const report = {
  milestone: corpus.milestone,
  implementationHash,
  startedAt: new Date().toISOString(),
  expected: corpus.expectedEpisodeCount,
  episodes: values.resume ? (previous.episodes ?? {}) : {},
};
const selected = values.events?.split(',');
const installationState = {};
const selectedEpisodes = values.episodes?.split(',');
if (
  selectedEpisodes?.some(
    (id) =>
      !corpus.events.some((event) =>
        event.episodes.some((episode) =>
          [episode.id, episode.scenarioId].includes(id),
        ),
      ),
  )
)
  throw new Error('Unknown corpus episode ID.');
if (
  selected?.some((id) => !corpus.events.some((event) => event.eventId === id))
)
  throw new Error('Unknown corpus event ID.');
for (const event of corpus.events) {
  if (selected && !selected.includes(event.eventId)) continue;
  for (const entry of event.episodes) {
    if (
      selectedEpisodes &&
      !selectedEpisodes.some((id) => id === entry.id || id === entry.scenarioId)
    )
      continue;
    if (unavailable.has(event.eventId)) {
      report.episodes[entry.id] = {
        status: 'source-unavailable',
        eventId: event.eventId,
        scenarioId: entry.scenarioId,
        evidence: unavailable.get(event.eventId).source,
      };
      continue;
    }
    const packagePath = resolve(
      root,
      `.cache/pjsk/packages/${entry.id}-${entry.scenarioId}.json`,
    );
    try {
      const pkg = JSON.parse(await readFile(packagePath));
      if (pkg.entry.id !== entry.id || pkg.entry.path !== entry.path)
        throw new Error('Source package does not match corpus identity.');
      const sourceHash =
        pkg.report.sourceIdentity?.sourceSha256 ??
        pkg.report.sources.at(-1).sha256;
      const old = report.episodes[entry.id];
      if (
        values.resume &&
        old?.status === 'installed' &&
        old.sourceHash === sourceHash &&
        old.implementationHash === implementationHash
      ) {
        const episode = JSON.parse(
          await readFile(resolve(root, `src/generated/${entry.id}.json`)),
        );
        const program = JSON.parse(
          await readFile(
            resolve(pjskLibraryRoot, '.' + episode.renderer.payload.url),
          ),
        );
        if (program.sourceHash !== sourceHash)
          throw new Error('Installed program source hash differs.');
        const manifest = program.media.files.some((file) => file.deferred)
          ? JSON.parse(
              await readFile(
                resolve(pjskLibraryRoot, 'private/pjsk/deferred.json'),
              ),
            )
          : {};
        for (const file of program.media.files) {
          if (file.deferred) {
            const record = manifest[sha256(file.sourceUrl)];
            if (
              !record ||
              record.url !== file.url ||
              record.bytes !== file.bytes ||
              record.md5 !== file.md5
            )
              throw new Error(`Missing deferred voice descriptor: ${file.url}`);
            continue;
          }
          const bytes = await readFile(
            resolve(pjskLibraryRoot, '.' + file.url),
          );
          if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
            throw new Error(`Installed file checksum mismatch: ${file.url}`);
        }
        console.log(`Verified existing ${entry.scenarioId}`);
        continue;
      }
      console.log(`Installing event ${event.eventId}: ${entry.scenarioId}`);
      const result = await installPjskEpisode(pkg, {
        libraryDir: pjskLibraryRoot,
        generatedDir: resolve(root, 'src/generated'),
        offline: !!values.offline,
        state: installationState,
      });
      report.episodes[entry.id] = {
        status: 'installed',
        eventId: event.eventId,
        scenarioId: entry.scenarioId,
        sourceHash,
        implementationHash,
        ...result,
      };
    } catch (error) {
      report.episodes[entry.id] = {
        status: 'failed',
        eventId: event.eventId,
        scenarioId: entry.scenarioId,
        error: error.message,
      };
      console.error(`${entry.scenarioId}: ${error.message}`);
    }
    await writeJson(reportPath, report);
  }
}
report.finishedAt = new Date().toISOString();
report.installed = Object.values(report.episodes).filter(
  (item) => item.status === 'installed',
).length;
report.failed = Object.values(report.episodes).filter(
  (item) => item.status === 'failed',
).length;
report.unavailable = Object.values(report.episodes).filter(
  (item) => item.status === 'source-unavailable',
).length;
await writeJson(reportPath, report);
console.log(
  `PJSK corpus: ${report.installed}/${corpus.expectedEpisodeCount} installed; ${report.unavailable} source-unavailable; ${report.failed} failures. Report: ${reportPath}`,
);
if (report.failed) process.exitCode = 1;
