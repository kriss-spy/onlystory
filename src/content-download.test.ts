import { afterEach, expect, it, vi } from 'vitest';
import { loadEpisode } from './content';
import { pjskDownloads } from './downloads/pjsk-catalog';
import legacy from './downloads/pjsk-mmj-01-01.json';
import type { Episode } from './model';

function chapterText(episode: Episode) {
  const ids = Array.from({ length: episode.content!.count }, (_, i) =>
    i === 0 ? episode.entryNodeId! : episode.id + ':' + i,
  );
  return {
    format: 'pjsk-text-v1',
    id: episode.id,
    assets: [],
    nodes: ids.map((id, i) => ({
      id,
      kind: i === ids.length - 1 ? 'end' : 'text',
      text: { en: 'test', 'zh-CN': 'test' },
      scene: { background: 'platform', actors: [] },
      next: ids[i + 1],
    })),
  };
}
function cacheWith(entries: Record<string, unknown>) {
  vi.stubGlobal('window', { caches: {} });
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) =>
        url in entries
          ? new Response(JSON.stringify(entries[url]), {
              headers: { 'Content-Type': 'application/json' },
            })
          : undefined,
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('Unexpected network request');
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
it('reads the selected cached chapter when an older PJSK download is also present', async () => {
  const episode = pjskDownloads.find(
    (c) => c.episode.id !== legacy.entry.id,
  )!.episode;
  cacheWith({
    [episode.content!.url]: chapterText(episode),
    [legacy.text.url]: chapterText(legacy.episode as Episode),
    [legacy.program.url]: {},
  });
  const loaded = await loadEpisode(episode, true);
  expect(loaded.id).toBe(episode.id);
  expect(loaded.renderer).toEqual(episode.renderer);
  expect(loaded.content!.url).toBe(episode.content!.url);
});
it('preserves the original one-chapter build download on upgrade', async () => {
  const episode = pjskDownloads.find(
    (c) => c.episode.id === legacy.entry.id,
  )!.episode;
  cacheWith({
    [legacy.text.url]: chapterText(legacy.episode as Episode),
    [legacy.program.url]: {},
  });
  const loaded = await loadEpisode(episode, true);
  expect(loaded.content!.url).toBe(legacy.text.url);
  expect(loaded.renderer!.payload).toEqual({ url: legacy.program.url });
});
