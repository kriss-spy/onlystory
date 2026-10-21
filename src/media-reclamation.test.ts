import { afterEach, expect, test, vi } from 'vitest';
import { emptyData, type AppData } from './model';
import {
  reclaimRemovedMedia,
  retainRemovedMedia,
  REMOVAL_RETENTION_MS,
  restoreRemovedInstallations,
} from './media-reclamation';
import { savePjskInventory } from './downloads/pjsk-inventory';

afterEach(() => vi.unstubAllGlobals());
function memoryCache() {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  const records = new Map<string, Response>();
  const path = (key: RequestInfo | URL) =>
    new URL(key instanceof Request ? key.url : String(key), 'http://localhost/')
      .pathname;
  const cache = {
    match: async (key: RequestInfo | URL) => records.get(path(key))?.clone(),
    put: async (key: RequestInfo | URL, response: Response) => {
      records.set(
        path(key),
        new Response(await response.arrayBuffer(), {
          headers: response.headers,
        }),
      );
    },
    delete: async (key: RequestInfo | URL) => records.delete(path(key)),
    keys: async () =>
      [...records.keys()].map((key) => new Request('http://localhost' + key)),
  } as unknown as Cache;
  vi.stubGlobal('caches', { open: async () => cache });
  return cache;
}
function installed(files: Record<string, string[]>): AppData {
  return {
    ...emptyData(),
    installed: Object.fromEntries(Object.keys(files).map((id) => [id, true])),
    installations: Object.fromEntries(
      Object.entries(files).map(([id, files]) => [
        id,
        { files, voices: ['ja'] },
      ]),
    ),
  };
}
test('Undo after a new-language reinstall restores both dependency sets without discarding newer installs', () => {
  const snapshot = installed({ story: ['/private/old-ja'] });
  const current = installed({
    story: ['/private/new-cn'],
    other: ['/private/other'],
  });
  current.installations!.story.voices = ['zh-CN'];
  const restored = restoreRemovedInstallations(current, snapshot, ['story']);
  expect(restored.installations!.story.files).toEqual([
    '/private/old-ja',
    '/private/new-cn',
  ]);
  expect(restored.installations!.story.voices).toEqual(['ja', 'zh-CN']);
  expect(restored.installed.other).toBe(true);
});
test('removal dry run protects shared objects, shell files, unlisted cache entries and Undo, then reclaims only unreachable media', async () => {
  const cache = memoryCache();
  const state = installed({
    first: ['/private/first.bin', '/private/shared.bin', '/vendor/core.js'],
    second: ['/private/shared.bin'],
  });
  for (const path of [
    '/private/first.bin',
    '/private/shared.bin',
    '/vendor/core.js',
    '/private/unlisted.bin',
  ])
    await cache.put(
      path,
      new Response('abc', { headers: { 'Content-Length': '3' } }),
    );
  const key = await retainRemovedMedia(cache, state, ['first'], 0);
  state.installed.first = false;
  expect((await reclaimRemovedMedia(() => state, { now: 1 })).files).toEqual(
    [],
  );
  const report = await reclaimRemovedMedia(() => state, {
    now: REMOVAL_RETENTION_MS,
  });
  expect(report.files).toEqual(['/private/first.bin']);
  expect(report.bytes).toBe(3);
  expect(await cache.match('/private/first.bin')).toBeDefined();
  await reclaimRemovedMedia(() => state, {
    now: REMOVAL_RETENTION_MS,
    dryRun: false,
  });
  expect(await cache.match('/private/first.bin')).toBeUndefined();
  expect(await cache.match('/private/shared.bin')).toBeDefined();
  expect(await cache.match('/vendor/core.js')).toBeDefined();
  expect(await cache.match('/private/unlisted.bin')).toBeDefined();
  expect(await cache.match(key)).toBeUndefined();
});
test('Undo and a later installation preserve removed media across a new cleanup pass', async () => {
  const cache = memoryCache();
  const state = installed({ story: ['/private/a'] });
  await cache.put('/private/a', new Response('a'));
  const key = await retainRemovedMedia(cache, state, ['story'], 0);
  state.installed.story = false;
  await cache.delete(key); // Undo cancels the durable journal before restoring the install.
  state.installed.story = true;
  expect(
    (await reclaimRemovedMedia(() => state, { now: 100_000, dryRun: false }))
      .files,
  ).toEqual([]);
  await retainRemovedMedia(cache, state, ['story'], 0);
  state.installed.story = false;
  state.installed.newStory = true;
  state.installations!.newStory = { files: ['/private/a'], voices: ['ja'] };
  expect(
    (await reclaimRemovedMedia(() => state, { now: 100_000, dryRun: false }))
      .files,
  ).toEqual([]);
  expect(await cache.match('/private/a')).toBeDefined();
});
test('nested installation inventories protect shared media, and missing inventories block unsafe deletion', async () => {
  const cache = memoryCache();
  const inventory = await savePjskInventory(cache, 'other', [
    '/private/shared',
  ]);
  const state = installed({
    story: ['/private/shared', '/private/only'],
    other: inventory,
  });
  await cache.put('/private/shared', new Response('shared'));
  await cache.put('/private/only', new Response('only'));
  await retainRemovedMedia(cache, state, ['story'], 0);
  state.installed.story = false;
  expect(
    (await reclaimRemovedMedia(() => state, { now: 100_000 })).files,
  ).toEqual(['/private/only']);
  await cache.delete(inventory[0]);
  const report = await reclaimRemovedMedia(() => state, {
    now: 100_000,
    dryRun: false,
  });
  expect(report.blocked).toBe(true);
  expect(await cache.match('/private/only')).toBeDefined();
});
test('an interrupted cleanup retains its journal and safely resumes after restart', async () => {
  const cache = memoryCache();
  const state = installed({ story: ['/private/a', '/private/b'] });
  await cache.put('/private/a', new Response('a'));
  await cache.put('/private/b', new Response('b'));
  const key = await retainRemovedMedia(cache, state, ['story'], 0);
  state.installed.story = false;
  const original = cache.delete.bind(cache);
  cache.delete = vi
    .fn()
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(Error('disk interrupted'));
  await expect(
    reclaimRemovedMedia(() => state, { now: 100_000, dryRun: false }),
  ).rejects.toThrow('disk interrupted');
  expect(await cache.match(key)).toBeDefined();
  cache.delete = original;
  await reclaimRemovedMedia(() => state, { now: 100_000, dryRun: false });
  expect(await cache.match('/private/b')).toBeUndefined();
  expect(await cache.match(key)).toBeUndefined();
});
