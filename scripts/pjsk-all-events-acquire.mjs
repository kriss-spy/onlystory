import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { buildPjskAvailability } from './pjsk-availability.mjs';
import { createSourceCache, writeJson } from './pjsk-import.mjs';
import { catalogEntries, masterUrl } from './pjsk-scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    offline: { type: 'boolean' },
    'manifest-only': { type: 'boolean' },
  },
});
const get = createSourceCache(resolve(root, '.cache/pjsk/http'), {
  offline: values.offline,
});
const [stories, eventsSource, unitSource] = await Promise.all([
  get(masterUrl('cn', 'event')),
  get(
    'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/events.json',
  ),
  get(
    'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/eventStoryUnits.json',
  ),
]);
const sourceRows = JSON.parse(stories.bytes),
  eventsRows = JSON.parse(eventsSource.bytes),
  unitRows = JSON.parse(unitSource.bytes),
  entries = catalogEntries(sourceRows, 'cn', 'event');
let identityBindings = [];
try {
  identityBindings = JSON.parse(
    await readFile(resolve(root, 'docs/pjsk-scenario-identities.json'), 'utf8'),
  ).bindings;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const entry of entries) {
  const binding = identityBindings.find(
    (row) => row.scenarioId === entry.scenarioId,
  );
  if (binding) entry.identityBinding = binding;
}
const events = sourceRows
  .map((story) => {
    const event = eventsRows.find((e) => e.id === story.eventId);
    if (!event || event.assetbundleName !== story.assetbundleName)
      throw new Error('Event identity mismatch ' + story.eventId);
    const episodes = entries
      .filter((e) => e.collection === String(story.eventId))
      .sort((a, b) => a.episodeNo - b.episodeNo);
    if (
      new Set(episodes.map((e) => e.id)).size !== episodes.length ||
      episodes.some((e, i) => e.episodeNo !== i + 1)
    )
      throw new Error('Nonconsecutive episode metadata ' + story.eventId);
    return {
      eventId: String(story.eventId),
      bundle: story.assetbundleName,
      name: event.name,
      unit: event.unit,
      startAt: event.startAt,
      storyUnits: unitRows
        .filter((row) => row.eventStoryId === story.id)
        .sort((a, b) => a.seq - b.seq),
      expectedEpisodeCount: episodes.length,
      episodes,
    };
  })
  .sort((a, b) => Number(a.eventId) - Number(b.eventId));
const manifest = {
  schemaVersion: 1,
  kind: 'event',
  milestone: 'pjsk-all-cn-events-v1',
  textRegion: 'cn',
  mediaRegion: 'jp',
  metadataEvidence: [stories, eventsSource, unitSource].map((r) => ({
    url: r.url,
    sha256: r.sha256,
    bytes: r.bytes.length,
  })),
  expectedEventCount: events.length,
  expectedEpisodeCount: entries.length,
  events,
};
const manifestPath = resolve(root, 'docs/pjsk-all-events.json');
await writeJson(manifestPath, manifest);
const groupEvents = events.map((event) => {
  const relations = event.storyUnits;
  const mainGroups = relations
    .filter((row) => row.eventStoryUnitRelation === 'main')
    .map((row) => row.unit);
  const subGroups = relations
    .filter((row) => row.eventStoryUnitRelation === 'sub')
    .map((row) => row.unit);
  return {
    eventId: event.eventId,
    name: event.name,
    eventUnit: event.unit,
    mainGroups,
    subGroups,
    allGroups: [...new Set(relations.map((row) => row.unit))],
    classification:
      mainGroups.length === 1
        ? mainGroups[0]
        : mainGroups.length > 1
          ? 'mixed'
          : subGroups.length === 1
            ? subGroups[0]
            : subGroups.length > 1
              ? 'mixed'
              : 'unclassified',
    relations,
  };
});
await mkdir(resolve(root, '.cache/pjsk/all-events-validation'), {
  recursive: true,
});
await writeJson(
  resolve(root, '.cache/pjsk/all-events-validation/group-evidence.json'),
  {
    source: {
      url: unitSource.url,
      sha256: unitSource.sha256,
      bytes: unitSource.bytes.length,
    },
    summary: {
      total: groupEvents.length,
      unclassified: groupEvents.filter(
        (event) => event.classification === 'unclassified',
      ).length,
      mixed: groupEvents.filter((event) => event.classification === 'mixed')
        .length,
      multipleMain: groupEvents.filter((event) => event.mainGroups.length > 1)
        .length,
    },
    events: groupEvents,
  },
);
console.log(
  JSON.stringify({
    events: events.length,
    episodes: entries.length,
    first: events[0].eventId,
    last: events.at(-1).eventId,
  }),
);
if (!values['manifest-only']) {
  const reportDir = resolve(root, '.cache/pjsk/all-events-validation');
  const acquisitionPath = resolve(reportDir, 'acquisition.json');
  let previousStamp = null;
  try {
    previousStamp = (await stat(acquisitionPath)).mtimeMs;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const args = [
    resolve(root, 'scripts/pjsk-corpus.mjs'),
    '--manifest',
    manifestPath,
    '--report',
    resolve(root, '.cache/pjsk/all-events-validation'),
    '--concurrency',
    '8',
    ...(values.offline ? ['--offline'] : []),
  ];
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  const childCode = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => done(code ?? 1));
  });
  if (childCode > 1 || (await stat(acquisitionPath)).mtimeMs === previousStamp)
    throw new Error(
      'Scenario acquisition did not produce a fresh complete report.',
    );
  const acquisition = JSON.parse(await readFile(acquisitionPath, 'utf8'));
  if (acquisition.episodes?.length !== manifest.expectedEpisodeCount)
    throw new Error(
      'Incomplete scenario acquisition report; availability cannot be inferred.',
    );
  const availability = await buildPjskAvailability({
    manifest,
    acquisition,
    cacheDir: resolve(root, '.cache/pjsk/http/availability'),
    reportDir,
    offline: values.offline,
  });
  console.log(
    JSON.stringify({
      available: availability.availableEpisodes,
      unavailable: availability.unavailableEpisodes,
      unavailableEvents: availability.unavailableEvents,
      failed: availability.failedEpisodes,
    }),
  );
  process.exitCode = availability.failedEpisodes ? 1 : 0;
}
