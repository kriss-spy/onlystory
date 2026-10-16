import { afterEach, expect, test, vi } from 'vitest';
import { downloadAsset, selectedSceneFiles } from './media-storage';

afterEach(() => vi.unstubAllGlobals());
test('gender-specific downloads select the exact gender and voice combination', () => {
  const movie = {
    url: 'male-cn',
    voices: { 'zh-CN': { url: 'male-cn' }, ja: { url: 'male-ja' } },
    female: {
      url: 'female-cn',
      voices: { 'zh-CN': { url: 'female-cn' }, ja: { url: 'female-ja' } },
    },
  };
  const program = {
    files: ['male-cn', 'male-ja', 'female-cn', 'female-ja', 'bg'].map(
      (url) => ({ url }),
    ),
    videos: { movie },
  };
  expect(selectedSceneFiles(program, 'ja', 'female')).toEqual([
    'female-ja',
    'bg',
  ]);
  expect(selectedSceneFiles(program, 'zh-CN', 'male')).toEqual([
    'male-cn',
    'bg',
  ]);
});
test('shared files remain installed when two languages use the same payload', () => {
  expect(
    selectedSceneFiles(
      {
        files: [{ url: 'same-movie' }],
        videos: {
          a: {
            voices: {
              'zh-CN': { url: 'same-movie' },
              ja: { url: 'same-movie' },
            },
          },
        },
      },
      'ja',
    ),
  ).toEqual(['same-movie']);
});

test('selected voice filters only other language movie files', () => {
  expect(
    selectedSceneFiles(
      {
        files: ['video-cn', 'video-ja', 'bg', 'subtitle'].map((url) => ({
          url,
        })),
        videos: {
          a: {
            voices: { 'zh-CN': { url: 'video-cn' }, ja: { url: 'video-ja' } },
          },
        },
      },
      'ja',
    ),
  ).toEqual(['video-ja', 'bg', 'subtitle']);
});

test('concurrent episodes share a stream, and one cancellation preserves the other transfer', async () => {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  let send!: (chunk: Uint8Array) => void, finish!: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = (chunk) => controller.enqueue(chunk);
      finish = () => controller.close();
    },
  });
  const fetcher = vi.fn(
    async () => new Response(stream, { headers: { 'content-length': '3' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  let saved: Uint8Array | undefined;
  const cache = {
    match: async () => undefined,
    put: async (_key: string, response: Response) => {
      saved = new Uint8Array(await response.arrayBuffer());
    },
    delete: async () => true,
  } as unknown as Cache;
  const first = new AbortController(),
    second = new AbortController();
  const a = downloadAsset(cache, '/shared.bin', first.signal, () => {});
  const b = downloadAsset(cache, '/shared.bin', second.signal, () => {});
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  first.abort();
  await rejected;
  send(new Uint8Array([1, 2, 3]));
  finish();
  expect(await b).toBe(3);
  expect(saved).toEqual(new Uint8Array([1, 2, 3]));
});
