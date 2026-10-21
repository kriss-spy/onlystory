import { afterEach, expect, test, vi } from 'vitest';
import { estimateDownloads } from './estimate';
import type { Episode } from '../model';

vi.mock('./providers', () => ({ isBaImport: () => false }));
vi.mock('./pjsk', () => ({
  loadPjskRecipe: async (episode: Episode) => ({
    scenario: { url: `/private/${episode.id}`, bytes: 4 },
    media: {
      files: [
        {
          url: '/private/shared',
          bytes: 8,
          sourceUrl: 'https://source.test/shared',
        },
        {
          url: '/private/cached',
          bytes: 2,
          sourceUrl: 'https://source.test/cached',
        },
      ],
    },
    extraFiles: [],
  }),
}));
afterEach(() => vi.unstubAllGlobals());
test('selection estimates unique incremental pinned bytes and already cached bytes across stories', async () => {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (path: string) =>
        path === '/private/cached' ? new Response('ok') : undefined,
    }),
  });
  const episodes = ['first', 'second'].map(
    (id) => ({ id, acquisition: 'pinned' }) as unknown as Episode,
  );
  expect(
    await estimateDownloads(episodes, new AbortController().signal),
  ).toEqual({
    bytes: 16,
    reusedBytes: 2,
    files: 4,
    unknownFiles: 0,
    originals: false,
  });
});
test('canceling selection abandons estimates before loading acquisition recipes', async () => {
  vi.stubGlobal('caches', { open: async () => ({}) });
  const controller = new AbortController();
  controller.abort();
  await expect(
    estimateDownloads(
      [{ id: 'first', acquisition: 'pinned' } as unknown as Episode],
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
