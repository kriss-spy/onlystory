import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeJson } from './pjsk-import.mjs';

const { values } = parseArgs({
  options: {
    manifest: { type: 'string', default: 'docs/pjsk-all-events.json' },
    availability: {
      type: 'string',
      default: '.cache/pjsk/all-events-validation/availability.json',
    },
    output: {
      type: 'string',
      default: '.cache/pjsk/all-events-validation/available-corpus.json',
    },
  },
});
const manifest = JSON.parse(await readFile(resolve(values.manifest), 'utf8'));
const availability = JSON.parse(
  await readFile(resolve(values.availability), 'utf8'),
);
const ids = new Set(manifest.events.map((event) => event.eventId));
const excluded = new Set();
for (const event of availability.events) {
  if (
    !ids.has(event.eventId) ||
    event.status !== 'cn-scenarios-unavailable' ||
    event.keys.length ||
    !event.source?.sha256
  )
    throw new Error(`Unverified availability exclusion: ${event.eventId}`);
  excluded.add(event.eventId);
}
const events = manifest.events.filter((event) => !excluded.has(event.eventId));
const expectedEpisodeCount = events.reduce(
  (sum, event) => sum + event.episodes.length,
  0,
);
if (
  expectedEpisodeCount !== availability.availableEpisodes ||
  excluded.size !== availability.unavailableEvents
)
  throw new Error('Availability totals do not match the source manifest.');
await writeJson(resolve(values.output), {
  ...manifest,
  expectedEventCount: events.length,
  expectedEpisodeCount,
  events,
});
console.log(
  JSON.stringify({
    events: events.length,
    episodes: expectedEpisodeCount,
    excludedEvents: excluded.size,
  }),
);
