import { afterEach, expect, test, vi } from 'vitest';
import {
  downloadAsset,
  migrateMediaCache,
  selectedSceneFiles,
  canonicalMediaPath,
} from './media-storage';
import { sha256 } from '@noble/hashes/sha2.js';

afterEach(() => vi.unstubAllGlobals());
test('mutable scene revisions retain their query in storage and transfer identities', async () => {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  const cache = { match: async () => undefined } as unknown as Cache;
  expect(
    await canonicalMediaPath(cache, '/private/story/scene.json?v=new'),
  ).toBe('/private/story/scene.json?v=new');
});
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

test('capable browsers install shared movie picture and the selected audio without combined fallbacks', () => {
  vi.stubGlobal('MediaSource', { isTypeSupported: () => true });
  const track = (name: string) => ({
    mime: name === 'video' ? 'video/mp4' : 'audio/mp4',
    init: { url: name + '-init', bytes: 1 },
    segments: [{ url: name + '-segment', bytes: 2, start: 0, duration: 1 }],
  });
  const streams = {
    duration: 1,
    video: track('video'),
    audio: { ja: track('ja'), 'zh-CN': track('cn') },
  };
  const program = {
    files: [
      'combined-ja',
      'combined-cn',
      'bg',
      'video-init',
      'video-segment',
      'ja-init',
      'ja-segment',
      'cn-init',
      'cn-segment',
    ].map((url) => ({ url })),
    videos: {
      movie: {
        url: 'combined-cn',
        voices: { ja: { url: 'combined-ja' }, 'zh-CN': { url: 'combined-cn' } },
        streams,
      },
    },
  };
  expect(selectedSceneFiles(program, 'ja')).toEqual([
    'bg',
    'video-init',
    'video-segment',
    'ja-init',
    'ja-segment',
  ]);
  vi.stubGlobal('MediaSource', { isTypeSupported: () => false });
  expect(selectedSceneFiles(program, 'ja')).toEqual(['combined-ja', 'bg']);
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

test('legacy movies above 16 MiB migrate by streaming SHA-256 without whole-file buffers', async () => {
  vi.stubGlobal('location', { href: 'http://localhost/' });
  const bytes = new Uint8Array(17 * 1024 * 1024).fill(43);
  const hash = [...sha256(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const target = `/private/shared/${hash}.mp4`;
  const index = { version: 1, aliases: { '/private/old.mp4': target } };
  vi.stubGlobal('fetch', async () => Response.json(index));
  let removed = false,
    copied = 0;
  const streamed = () => {
    let offset = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.subarray(offset, (offset += 256 * 1024)));
        },
      }),
    );
    response.arrayBuffer = vi.fn(async () => {
      throw Error('Whole-file buffer forbidden');
    });
    return response;
  };
  const cache = {
    match: async (key: string | Request) =>
      (typeof key === 'string' ? key : new URL(key.url).pathname) ===
        '/private/old.mp4' && !removed
        ? streamed()
        : undefined,
    keys: async () => [new Request('http://localhost/private/old.mp4')],
    put: async (key: string, response: Response) => {
      if (key !== target) return;
      const reader = response.body!.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        copied += next.value.byteLength;
      }
    },
    delete: async () => {
      removed = true;
      return true;
    },
  } as unknown as Cache;
  vi.stubGlobal('caches', { open: async () => cache });
  await migrateMediaCache();
  expect(copied).toBe(bytes.length);
  expect(removed).toBe(true);
});
