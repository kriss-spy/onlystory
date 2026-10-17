import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from './pjsk-import.mjs';
import { sha256 } from './pjsk-scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = resolve(root, '.cache/pjsk/all-events-validation');
const manifest = JSON.parse(
  await readFile(resolve(root, 'docs/pjsk-all-events.json'), 'utf8'),
);
const acquisition = JSON.parse(
  await readFile(resolve(directory, 'acquisition.json'), 'utf8'),
);
const failedIds = new Set(
  acquisition.episodes
    .filter((e) => e.status === 'failed')
    .map((e) => e.eventId),
);
const queue = manifest.events.filter((e) => failedIds.has(e.eventId)),
  events = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const event = queue.shift();
      const url =
        'https://storage.sekai.best/sekai-cn-assets/?list-type=2&prefix=' +
        encodeURIComponent(`event_story/${event.bundle}/scenario/`);
      let data;
      for (let attempt = 0; attempt < 3; attempt++)
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok)
            throw new Error(`HTTP ${response.status} for ${url}`);
          data = Buffer.from(await response.arrayBuffer());
          break;
        } catch (error) {
          if (attempt === 2) throw error;
        }
      const text = data.toString('utf8'),
        keys = [...text.matchAll(/<Key>([^<]+)/g)].map((m) => m[1]);
      if (
        !text.includes('<ListBucketResult') ||
        text.includes('<IsTruncated>true')
      )
        throw new Error('Incomplete directory evidence ' + url);
      events.push({
        eventId: event.eventId,
        name: event.name,
        startAt: event.startAt,
        releaseDate: new Date(event.startAt).toISOString().slice(0, 10),
        episodeCount: event.episodes.length,
        status: keys.length
          ? 'directory-has-files'
          : 'cn-scenarios-unavailable',
        source: { url, sha256: sha256(data), bytes: data.length },
        keys,
      });
      console.log(`${event.eventId} ${keys.length} CN source files`);
    }
  }),
);
events.sort((a, b) => Number(a.eventId) - Number(b.eventId));
await writeJson(resolve(directory, 'availability.json'), {
  checkedAt: new Date().toISOString(),
  availableEpisodes: acquisition.acquired,
  unavailableEpisodes: acquisition.failed,
  unavailableEvents: events.length,
  events,
});
