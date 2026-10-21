import recipe from './ba/recipe.json';
import type { DownloadProgress } from './pjsk';
import type { Episode } from '../model';
import { loadBaRecipe, type BaOriginal, type BaRecipe } from './ba-catalog';
import { convertBaMedia, type MediaConversion } from './ba/convert';
import { requiredBaInputs } from './ba/output-cache.mjs';
import { withMediaLock } from '../media-lock';

export { recipe as baRecipe };
export type ImportProgress = DownloadProgress & {
  message?: string;
  fraction?: number;
};
function matches(file: File, input: BaOriginal) {
  return (
    file.size === input.bytes &&
    [
      input.filename,
      decodeURIComponent(new URL(input.url).pathname.split('/').at(-1)!),
    ].some(
      (name) =>
        name === file.name ||
        name === file.name.replace(/ \(\d+\)(?=\.[^.]+$)/, ''),
    )
  );
}
export function selectedOriginals(
  files: File[],
  chapter: BaRecipe = recipe as unknown as BaRecipe,
) {
  return chapter.inputs.filter((a) => files.some((f) => matches(f, a)));
}

async function originals(
  recipe: BaRecipe,
  signal: AbortSignal,
  report: (value: ImportProgress) => void,
  inputs: BaOriginal[] = recipe.inputs,
) {
  const desktop = window.onlystoryDesktop;
  if (!desktop) throw Error('Choose the original files to import this story.');
  const files: File[] = [];
  const stop = new AbortController();
  signal = AbortSignal.any([signal, stop.signal]);
  const total = inputs.reduce((n, a) => n + a.bytes, 0);
  let next = 0,
    bytes = 0;
  const abort = () => {
    void desktop.cancelDownloads();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < inputs.length) {
          signal.throwIfAborted();
          const input = inputs[next++];
          const body = await desktop.readOriginal(input.id);
          signal.throwIfAborted();
          files.push(new File([body], input.filename));
          bytes += input.bytes;
          report({
            bytes,
            total,
            fraction: total ? (0.6 * bytes) / total : 0,
            filesDone: files.length,
            filesTotal: inputs.length,
            message: `Downloading original files`,
          });
        }
      }),
    );
    return files;
  } catch (error) {
    stop.abort();
    await desktop.cancelDownloads();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

async function importChapter(
  episode: Episode,
  files: File[] | undefined,
  signal: AbortSignal,
  report: (value: ImportProgress) => void,
): Promise<string[]> {
  const recipe = await loadBaRecipe(episode, signal);
  const inputs = await requiredBaInputs(recipe);
  const total = inputs.reduce((n, a) => n + a.bytes, 0);
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < total * 2)
    throw Error(
      'Not enough storage to import this chapter. Free some space and try again.',
    );
  const selected = files ?? (await originals(recipe, signal, report, inputs));
  signal.throwIfAborted();
  if (inputs.some((input) => !selected.some((file) => matches(file, input))))
    throw Error(
      'Some original files are missing or have the wrong size. Check the source list.',
    );
  // Register the offline shell before publishing an installation. Playback uses
  // its media-cache handler for URLs inside Spine and audio runtimes too.
  if (import.meta.env.PROD) {
    if (!('serviceWorker' in navigator))
      throw Error('This browser cannot prepare offline playback.');
    await new Promise<void>((resolve, reject) => {
      const end = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        navigator.serviceWorker.removeEventListener('controllerchange', ready);
        if (error) reject(error);
        else resolve();
      };
      const ready = () => {
        if (navigator.serviceWorker.controller) end();
      };
      const abort = () =>
        end(new DOMException('Import canceled', 'AbortError'));
      const timer = setTimeout(
        () =>
          end(
            Error(
              'Offline playback could not be prepared. Check available storage, then reload and retry.',
            ),
          ),
        30000,
      );
      signal.addEventListener('abort', abort, { once: true });
      navigator.serviceWorker.addEventListener('controllerchange', ready);
      ready();
    });
  }
  signal.throwIfAborted();
  report({
    bytes: total,
    total,
    filesDone: 0,
    filesTotal: inputs.length,
    fraction: 0.6,
    message: 'Checking original files',
  });
  return new Promise((resolve, reject) => {
    const stagingCacheName = 'onlystory.ba-staging.' + crypto.randomUUID();
    const worker = new Worker(new URL('./ba/worker.mjs', import.meta.url), {
      type: 'module',
    });
    const end = () => {
      worker.terminate();
      void caches.delete(stagingCacheName).catch(() => {});
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      end();
      void window.onlystoryDesktop?.cancelDownloads();
      reject(new DOMException('Import canceled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      end();
      reject(Error(event.message || 'The importer could not start.'));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress')
        report({
          bytes: total,
          total,
          fraction:
            data.message === 'Decoding original English story database'
              ? 0.94 + (0.04 * data.done) / Math.max(1, data.total)
              : data.message === 'Decoding original story database'
                ? 0.9 +
                  ((recipe.localization ? 0.04 : 0.08) * data.done) /
                    Math.max(1, data.total)
                : data.message === 'Importing story media'
                  ? 0.65 + (0.25 * data.done) / Math.max(1, data.total)
                  : 0.6 + (0.05 * data.done) / Math.max(1, data.total),
          filesDone: data.done,
          filesTotal: data.total,
          message: data.message,
        });
      else if (data.type === 'error') {
        end();
        reject(Error(data.message));
      } else if (data.type === 'convert') {
        void convertBaMedia(data as MediaConversion, signal).then(
          (bytes) => {
            if (!signal.aborted)
              worker.postMessage({ type: 'converted', id: data.id, bytes }, [
                bytes.buffer,
              ]);
          },
          (error) => {
            if (!signal.aborted)
              worker.postMessage({
                type: 'converted',
                id: data.id,
                error: error instanceof Error ? error.message : String(error),
              });
          },
        );
      } else if (data.type === 'complete') {
        end();
        resolve(data.result.installationFiles);
      }
    };
    worker.postMessage({
      recipe,
      stagingCacheName,
      files: inputs.map((input) => {
        const file = selected.find((file) => matches(file, input))!;
        return file.name === input.filename
          ? file
          : new File([file], input.filename);
      }),
    });
  });
}

let active = false;
const waiting: (() => void)[] = [];
async function slot(signal: AbortSignal) {
  signal.throwIfAborted();
  if (!active) {
    active = true;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const next = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      const index = waiting.indexOf(next);
      if (index >= 0) waiting.splice(index, 1);
      reject(signal.reason);
    };
    waiting.push(next);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function importBaChapter(
  episode: Episode,
  files: File[] | undefined,
  signal: AbortSignal,
  report: (value: ImportProgress) => void,
): Promise<string[]> {
  report({
    bytes: 0,
    total: 0,
    filesDone: 0,
    filesTotal: 0,
    message: active ? 'Queued for import' : 'Preparing story',
  });
  await slot(signal);
  try {
    return await withMediaLock('onlystory:ba-import', signal, () =>
      importChapter(episode, files, signal, report),
    );
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active = false;
  }
}
