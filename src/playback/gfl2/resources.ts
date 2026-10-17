const CACHE = 'onlystory.media.v1';
import { matchMedia } from '../../media-storage';

export async function cachedResponse(url: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const cache =
    'caches' in window ? await caches.open(CACHE).catch(() => null) : null;
  const cached = await matchMedia(cache, url);
  const response = cached ?? (await fetch(url, { signal }));
  signal?.throwIfAborted();
  if (
    !response.ok ||
    response.headers.get('content-type')?.includes('text/html')
  )
    throw new Error(`Scene asset unavailable: ${url.split('/').at(-1)}`);
  return response;
}

let core: Promise<void> | undefined;
let preparedCore: Promise<void> | undefined;

function prepareCubismCore() {
  if (!preparedCore) {
    preparedCore = (async () => {
      const deadline = performance.now() + 5000;
      for (;;) {
        try {
          const runtime = (
            window as unknown as Window & {
              Live2DCubismCore: {
                Memory: { initializeAmountOfMemory: (bytes: number) => void };
              };
            }
          ).Live2DCubismCore;
          // Core's asm.js heap growth leaves existing model parameter/vertex
          // views pointing at the old buffer, freezing models loaded earlier.
          // Reserve before creating any model. This 64 MiB request produces a
          // 128 MiB heap, enough for the complete 13-model validation episode.
          runtime.Memory.initializeAmountOfMemory(64 * 1024 * 1024);
          return;
        } catch (error) {
          // The script load event can precede Core's asynchronous initialization.
          if (performance.now() >= deadline)
            throw new Error(
              'The Live2D runtime could not prepare its memory.',
              {
                cause: error,
              },
            );
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    })();
    void preparedCore.catch(() => {
      preparedCore = undefined;
    });
  }
  return preparedCore;
}
let framework:
  Promise<typeof import('pixi-live2d-display/cubism4')> | undefined;
export function loadLive2D() {
  if (!framework) {
    framework = loadCubismCore().then(
      () => import('pixi-live2d-display/cubism4'),
    );
    void framework.catch(() => {
      framework = undefined;
    });
  }
  return framework;
}
export function loadCubismCore() {
  if ('Live2DCubismCore' in window) return prepareCubismCore();
  if (!core) {
    core = (async () => {
      const response = await cachedResponse('/vendor/live2dcubismcore.min.js');
      const url = URL.createObjectURL(await response.blob());
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = url;
          script.onload = () => {
            script.remove();
            resolve();
          };
          script.onerror = () => {
            script.remove();
            reject(new Error('The Live2D runtime could not be loaded.'));
          };
          document.head.append(script);
        });
        await prepareCubismCore();
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    void core.catch(() => {
      core = undefined;
    });
  }
  return core;
}

// Pixi's model loader uses XHR and image elements. Rewrite their URLs to local
// blobs so downloaded models also work when the browser is offline.
export async function localModel(url: string, signal: AbortSignal) {
  const settings = await (await cachedResponse(url, signal)).json();
  const blobs: string[] = [];
  let closed = false;
  const release = () => {
    closed = true;
    blobs.forEach((blob) => URL.revokeObjectURL(blob));
    blobs.length = 0;
  };
  const files = settings.FileReferences as Record<string, unknown>;
  const base = new URL(url, location.href);
  const local = async (file: string) => {
    const response = await cachedResponse(new URL(file, base).href, signal);
    const blob = await response.blob();
    signal.throwIfAborted();
    if (closed)
      throw new DOMException('Model loading was canceled.', 'AbortError');
    const object = URL.createObjectURL(blob);
    blobs.push(object);
    return object;
  };
  try {
    const rewrite = async (object: Record<string, unknown>) => {
      await Promise.all(
        Object.entries(object).map(async ([key, value]) => {
          if (
            typeof value === 'string' &&
            (key === 'File' ||
              ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'].includes(
                key,
              ))
          )
            object[key] = await local(value);
          else if (key === 'Textures' && Array.isArray(value))
            object[key] = await Promise.all(
              value.map((file) => local(String(file))),
            );
          else if (Array.isArray(value))
            await Promise.all(
              value.map((item) =>
                item && typeof item === 'object'
                  ? rewrite(item)
                  : Promise.resolve(),
              ),
            );
          else if (value && typeof value === 'object')
            await rewrite(value as Record<string, unknown>);
        }),
      );
    };
    await rewrite(files);
    settings.url = base.href;
    return { settings, release };
  } catch (error) {
    release();
    throw error;
  }
}
