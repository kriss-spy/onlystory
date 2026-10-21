import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadPjskChapter,
  compileChapter,
  recipe,
  verifyPjskFile,
} from './pjsk';
import type { Episode } from '../model';
import type { PjskRecipe } from './pjsk-recipe';
import { createHash } from 'node:crypto';

function emptyCache() {
  return {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => {}),
  } as unknown as Cache;
}
const episode = recipe.episode as Episode;
afterEach(() => vi.unstubAllGlobals());
describe('direct PJSK acquisition', () => {
  it('does not acquire discovery indexes or require them in the installed cache', async () => {
    const chapter = recipe as unknown as PjskRecipe;
    const original = { ...chapter };
    const digest = (bytes: Uint8Array) =>
      createHash('sha256').update(bytes).digest('hex');
    const source = {
      ScenarioId: chapter.entry.scenarioId,
      FirstBackground: '',
      FirstBgm: '',
      FirstLayout: [],
      AppearCharacters: [],
      Snippets: [
        { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
      ],
      TalkData: [
        {
          Body: 'Fixture dialogue',
          WindowDisplayName: 'Speaker',
          Voices: [],
          Motions: [],
        },
      ],
      LayoutData: [],
      SpecialEffectData: [],
      SoundData: [],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(source));
    const discovery = chapter.media.files.find((file) =>
      file.sourceUrl?.endsWith('/live2d/model_list.json'),
    )!;
    const contents = new Map<string, Response>();
    const cache = {
      match: async (url: string) => contents.get(url)?.clone(),
      put: async (url: string, response: Response) => {
        contents.set(url, response);
      },
    } as unknown as Cache;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          url === discovery.sourceUrl
            ? new Uint8Array(discovery.bytes + 1)
            : bytes,
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('navigator', {});
    try {
      Object.assign(chapter, {
        scenario: {
          ...chapter.scenario,
          bytes: bytes.length,
          sha256: digest(bytes),
          url: `/private/pjsk/assets/${digest(bytes)}.asset`,
        },
        media: {
          region: 'cn',
          backgrounds: {},
          music: {},
          voices: {},
          sounds: {},
          models: {},
          files: [discovery],
        },
        models: [],
      });
      const generated = compileChapter(source, chapter);
      chapter.program = {
        url: `/private/pjsk/assets/${digest(new TextEncoder().encode(JSON.stringify(generated.program)))}.json`,
      };
      chapter.text = {
        url: `/private/pjsk/assets/${digest(new TextEncoder().encode(JSON.stringify(generated.text)))}.json`,
      };
      const progress = vi.fn();
      const installed = await downloadPjskChapter(
        episode,
        cache,
        new AbortController().signal,
        progress,
      );
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        chapter.scenario.sourceUrl,
      ]);
      expect(installed).not.toContain(discovery.url);
      expect(installed).toContain(chapter.scenario.url);
      expect(installed).toContain(chapter.program.url);
      expect(installed).toContain(chapter.text.url);
      expect(chapter.media.files).toContain(discovery);
      expect(progress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filesDone: 1,
          filesTotal: 1,
          bytes: bytes.length,
          total: bytes.length,
        }),
      );
    } finally {
      Object.assign(chapter, original);
    }
  });
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
