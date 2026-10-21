import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadPjskChapter,
  compileChapter,
  recipe,
  verifyPjskFile,
} from './pjsk';
import type { Episode } from '../model';

function emptyCache() {
  return {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => {}),
  } as unknown as Cache;
}
const episode = recipe.episode as Episode;
afterEach(() => vi.unstubAllGlobals());
describe('direct PJSK acquisition', () => {
  it('verifies deferred voice bytes against the pinned upstream checksum', async () => {
    const file = {
      url: '/private/pjsk/remote/voice.mp3',
      sha256: null,
      bytes: 3,
      md5: '900150983cd24fb0d6963f7d28e17f72',
    };
    expect(await verifyPjskFile(new TextEncoder().encode('abc'), file)).toBe(
      true,
    );
    expect(await verifyPjskFile(new TextEncoder().encode('abd'), file)).toBe(
      false,
    );
    expect(await verifyPjskFile(new TextEncoder().encode('ab'), file)).toBe(
      false,
    );
  });
  it('can cancel a queued chapter without canceling the active download', async () => {
    vi.stubGlobal('navigator', {});
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener(
            'abort',
            () => reject(init.signal!.reason),
            { once: true },
          ),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const active = new AbortController(),
      queued = new AbortController();
    const first = downloadPjskChapter(
      episode,
      emptyCache(),
      active.signal,
      () => {},
    );
    const firstRejected = expect(first).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    const second = downloadPjskChapter(
      episode,
      emptyCache(),
      queued.signal,
      () => {},
    );
    const secondRejected = expect(second).rejects.toMatchObject({
      name: 'AbortError',
    });
    queued.abort();
    await secondRejected;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(active.signal.aborted).toBe(false);
    active.abort();
    await firstRejected;
  });
  it('checks available storage before requesting source files', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 100, usage: 90 }) },
    });
    await expect(
      downloadPjskChapter(
        episode,
        emptyCache(),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('Not enough browser storage');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not cache files that fail the pinned checksum', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            new Uint8Array(
              [recipe.scenario, ...recipe.media.files].find(
                (f) => f.sourceUrl === url,
              )!.bytes,
            ),
          ),
      ),
    );
    const cache = emptyCache();
    await expect(
      downloadPjskChapter(
        episode,
        cache,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('checksum');
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('aborts before fetching or publishing a prepared chapter', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    const cache = emptyCache();
    await expect(
      downloadPjskChapter(episode, cache, controller.signal, () => {}),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('cancels active requests without caching partial files', async () => {
    vi.stubGlobal('navigator', {});
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(init.signal!.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const cache = emptyCache();
    const job = downloadPjskChapter(
      episode,
      cache,
      controller.signal,
      () => {},
    );
    const rejected = expect(job).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    controller.abort();
    await rejected;
    expect(cache.put).not.toHaveBeenCalled();
  });
  it('rejects unreviewed scripts before compilation', () => {
    expect(() => compileChapter({ ScenarioId: 'another-chapter' })).toThrow(
      'another chapter',
    );
  });
});
