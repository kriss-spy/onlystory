import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  classifyEventAvailability,
  buildPjskAvailability,
} from './pjsk-availability.mjs';

const event = {
  eventId: '1',
  name: 'Future event',
  bundle: 'future',
  startAt: Date.UTC(2026, 11, 1),
  episodes: [1, 2].map((index) => ({
    id: `episode-${index}`,
    scenarioId: `event_01_0${index}`,
    path: `event_story/future/scenario/event_01_0${index}.asset`,
  })),
};
const rows = event.episodes.map((episode) => ({
  ...episode,
  eventId: '1',
  status: 'failed',
  error: `HTTP 404 for https://storage.sekai.best/sekai-cn-assets/${episode.path}`,
}));
const proofs = new Map(
  event.episodes.map((episode) => [episode.id, { status: 404 }]),
);
const emptyXml =
  '<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';

test('only a whole event with canonical source 404s and an empty CN listing is unavailable', () => {
  assert.equal(
    classifyEventAvailability(event, rows, proofs, { keys: [] }),
    'cn-scenarios-unavailable',
  );
  assert.equal(
    classifyEventAvailability(
      event,
      [{ ...rows[0], status: 'acquired' }, rows[1]],
      proofs,
      { keys: [] },
    ),
    'failed',
  );
  assert.equal(
    classifyEventAvailability(event, rows, proofs, {
      keys: ['event_story/future/scenario/some.asset'],
    }),
    'failed',
  );
  assert.equal(
    classifyEventAvailability(
      event,
      rows,
      new Map([[event.episodes[0].id, { status: 200 }]]),
      { keys: [] },
    ),
    'failed',
  );
  assert.equal(
    classifyEventAvailability(
      event,
      [{ ...rows[0], error: 'Scenario ID mismatch' }, rows[1]],
      proofs,
      { keys: [] },
    ),
    'failed',
  );
  assert.equal(
    classifyEventAvailability(event, rows.slice(0, 1), proofs, { keys: [] }),
    'failed',
  );
  assert.equal(
    classifyEventAvailability(
      event,
      rows.map((row) => ({
        ...row,
        status: 'acquired',
        identityBinding: { verified: true },
      })),
      new Map(),
      null,
    ),
    'available',
  );
});

test('online evidence is pinned and offline replay reclassifies cache misses without network', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'pjsk-availability-'));
  try {
    let calls = 0;
    const settings = {
      manifest: { events: [event] },
      acquisition: { episodes: rows },
      cacheDir: resolve(root, 'cache'),
      reportDir: resolve(root, 'report'),
      now: () => '2026-10-17T00:00:00.000Z',
    };
    const online = await buildPjskAvailability({
      ...settings,
      fetcher: async (url) => {
        calls++;
        return url.includes('?list-type=2')
          ? new Response(emptyXml)
          : new Response('Original source missing', { status: 404 });
      },
    });
    assert.equal(calls, 3);
    assert.equal(online.unavailableEpisodes, 2);
    assert.equal(online.failedEpisodes, 0);
    assert.equal(online.events[0].source.status, 200);
    assert.equal(online.events[0].scenarioSources.length, 2);
    const offlineRows = rows.map((row) => ({
      ...row,
      error: row.error.replace(
        'HTTP 404 for ',
        'Source is not cached for offline import: ',
      ),
    }));
    const offline = await buildPjskAvailability({
      ...settings,
      acquisition: { episodes: offlineRows },
      offline: true,
      fetcher: async () => {
        throw new Error('Network forbidden');
      },
    });
    assert.equal(offline.unavailableEpisodes, 2);
    assert.equal(offline.failedEpisodes, 0);
    assert.deepEqual(
      offline.events[0].listingSources,
      online.events[0].listingSources,
    );
    const proof = offline.events[0].scenarioSources[0];
    await writeFile(resolve(root, 'cache', proof.cacheFile), 'corrupt');
    const corrupt = await buildPjskAvailability({
      ...settings,
      offline: true,
      fetcher: async () => {
        throw new Error('Network forbidden');
      },
    });
    assert.equal(corrupt.unavailableEpisodes, 0);
    assert.equal(corrupt.failedEpisodes, 2);
    assert.match(corrupt.failures[0].error, /checksum mismatch/);
    assert.equal(
      JSON.parse(await readFile(resolve(root, 'report/availability.json')))
        .failedEpisodes,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('partially acquired events retain failed episodes without consulting missing-directory evidence', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'pjsk-partial-'));
  try {
    const report = await buildPjskAvailability({
      manifest: { events: [event] },
      acquisition: { episodes: [{ ...rows[0], status: 'acquired' }, rows[1]] },
      cacheDir: resolve(root, 'cache'),
      reportDir: root,
      fetcher: async () => {
        throw new Error('Partial events must not be exempted');
      },
    });
    assert.equal(report.availableEpisodes, 1);
    assert.equal(report.failedEpisodes, 1);
    assert.equal(report.unavailableEvents, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
