import type { Episode } from '../model';
import type { Program } from '../playback/pjsk/types';
import {
  compilePjskEpisode,
  compilePjskDownloadText,
} from '../../scripts/pjsk-program.mjs';
import { decodeScenario } from '../../scripts/pjsk-scenario-core.mjs';
import recipeData from './pjsk-mmj-01-01.json' with { type: 'json' };
import { md5 } from '@noble/hashes/legacy.js';
import { gunzipSync } from 'fflate';
import { pjskDownloadById } from './pjsk-catalog';
import type { PjskRecipe, PjskFile } from './pjsk-recipe';
import { withMediaLock } from '../media-lock';

export const recipe = recipeData;
type File = PjskFile;
export interface DownloadProgress {
  bytes: number;
  total: number;
  filesDone: number;
  filesTotal: number;
  message?: string;
}
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
export const verifyPjskFile = async (
  bytes: Uint8Array<ArrayBuffer>,
  file: PjskFile,
) =>
  bytes.byteLength === file.bytes &&
  (file.sha256
    ? (await hash(bytes)) === file.sha256
    : !!file.md5 &&
      Array.from(md5(bytes), (n) => n.toString(16).padStart(2, '0')).join(
        '',
      ) === file.md5);
const expectedHash = (url: string) => {
  const match =
    /^\/private\/pjsk\/assets\/([a-f0-9]{64})(?:\.[a-z0-9.]+)?$/.exec(url);
  if (!match) throw new Error('Invalid pinned chapter asset path.');
  return match[1];
};
export function isPjskSourceFile(file: PjskFile) {
  const source = file.sourceUrl;
  if (
    !Number.isSafeInteger(file.bytes) ||
    file.bytes <= 0 ||
    !(
      source?.startsWith('https://storage.sekai.best/') ||
      source?.startsWith('https://raw.githubusercontent.com/Sekai-World/')
    )
  )
    return false;
  if (!file.sha256)
    return (
      /^\/private\/pjsk\/remote\/[a-f0-9]{64}\.mp3$/.test(file.url) &&
      /^[a-f0-9]{32}$/.test(file.md5 ?? '')
    );
  try {
    return expectedHash(file.url) === file.sha256;
  } catch {
    return false;
  }
}

/** Rebuild the reviewed model settings using verified original settings and local paths. */
export function rewriteModel(
  original: unknown,
  model: PjskRecipe['models'][number],
  chapter: PjskRecipe = recipe as unknown as PjskRecipe,
) {
  const settings = structuredClone(original) as {
    FileReferences: {
      Textures: string[];
      Motions?: unknown;
      Expressions?: unknown;
      [key: string]: unknown;
    };
  };
  const refs = settings.FileReferences;
  if (model.references) {
    if (!refs) throw new Error('Missing original model settings.');
    settings.FileReferences = structuredClone(model.references) as typeof refs;
    return settings;
  }
  const source = chapter.media.files.find(
    (file) => file.url === model.original,
  )?.sourceUrl;
  if (!source || !refs) throw new Error('Missing original model settings.');
  const local = (reference: string) => {
    const url = new URL(reference, source).href;
    const file = chapter.media.files.find(
      (file) => file.sourceUrl === url || file.sourceUrl === url.toLowerCase(),
    );
    if (!file) throw new Error(`Unresolved model dependency: ${reference}`);
    return file.url;
  };
  for (const key of ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'])
    if (refs[key]) {
      if (typeof refs[key] !== 'string')
        throw new Error('Invalid model reference.');
      refs[key] = local(refs[key]);
    }
  refs.Textures = refs.Textures.map(local);
  refs.Motions = model.motions;
  delete refs.Expressions;
  return settings;
}

/** Same native command compiler as the maintainer importer, run on downloaded text. */
export function compileChapter(
  source: unknown,
  chapter: PjskRecipe = recipe as unknown as PjskRecipe,
) {
  const scenario = source as { ScenarioId?: string };
  if (
    scenario.ScenarioId !==
    (chapter.sourceScenarioId ?? chapter.entry.scenarioId)
  )
    throw new Error('The downloaded script is for another chapter.');
  const program = compilePjskEpisode(
    {
      entry: chapter.entry,
      scenario: (() => {
        const decoded = decodeScenario(source, chapter.entry.scenarioId, {
          sourceScenarioId: chapter.sourceScenarioId,
        });
        decoded.issues = decoded.issues.filter((value) => {
          const issue = value as {
            code: string;
            kind: string;
            reference: string;
            at: number;
          };
          return !chapter.issueResolutions?.some(
            (resolved) =>
              issue.code === 'invalid-media-reference' &&
              issue.kind === resolved.kind &&
              issue.reference === resolved.reference &&
              resolved.locations.includes(issue.at),
          );
        });
        return decoded;
      })(),
      report: { sourceIdentity: { sourceSha256: chapter.scenario.sha256 } },
    },
    chapter.media as Program['media'],
  );
  return {
    program,
    text: compilePjskDownloadText(
      program,
      chapter.version >= 2 ? chapter.program.url : undefined,
    ),
  };
}

const recipes = import.meta.glob('./pjsk-recipes/*.json.gz', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
export async function loadPjskRecipe(
  episode: Episode,
  signal: AbortSignal,
): Promise<PjskRecipe> {
  if (episode.acquisition === recipe.id && episode.id === recipe.entry.id)
    return recipe as unknown as PjskRecipe;
  const descriptor = pjskDownloadById.get(episode.id);
  if (!descriptor || episode.acquisition !== descriptor.episode.acquisition)
    throw new Error('No direct download recipe for this chapter.');
  const url = recipes['./pjsk-recipes/' + descriptor.recipe];
  const instructions = await caches.open('onlystory.pjsk-recipes.v1');
  const response =
    (await instructions.match(url)) ?? (await fetch(url, { signal }));
  if (!response.ok)
    throw new Error(
      'Chapter download instructions are unavailable. Reopen the app online and retry.',
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length !== descriptor.bytes ||
    (await hash(bytes)) !== descriptor.sha256
  )
    throw new Error(
      'Chapter download instructions failed their checksum. Update the app and retry.',
    );
  const chapter = JSON.parse(
    new TextDecoder().decode(gunzipSync(bytes)),
  ) as PjskRecipe;
  if (
    chapter.version !== 2 ||
    chapter.id !== episode.acquisition ||
    chapter.entry.id !== episode.id ||
    chapter.program.url !==
      (episode.renderer?.payload as { url: string })?.url ||
    chapter.text.url !== episode.content?.url
  )
    throw new Error('Chapter download instructions do not match this story.');
  await instructions.put(url, new Response(bytes));
  return chapter;
}

// Bulk selections share one three-request queue. Completed chapter files are
// checked again and reused by subsequent chapters with shared dependencies.
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
function release() {
  const next = waiting.shift();
  if (next) next();
  else active = false;
}

export async function downloadPjskChapter(
  episode: Episode,
  cache: Cache,
  signal: AbortSignal,
  progress: (value: DownloadProgress) => void,
): Promise<string[]> {
  progress({
    bytes: 0,
    total: 0,
    filesDone: 0,
    filesTotal: 0,
    message: active ? 'Queued for download' : 'Preparing download',
  });
  await slot(signal);
  try {
    const recipe = await loadPjskRecipe(episode, signal);
    // The importer uses this moving index to discover models. Playback uses the
    // pinned model references already in the recipe, not the discovery index.
    // Retain recipe.media unchanged so prepared program hashes stay identical.
    const mediaFiles = recipe.media.files.filter(
      (file) =>
        file.sourceUrl !==
        'https://storage.sekai.best/sekai-live2d-assets/live2d/model_list.json',
    );
    const files: File[] = [
      recipe.scenario,
      ...mediaFiles.filter((file) => file.sourceUrl),
      ...(recipe.extraFiles ?? []),
    ];
    const state = {
      bytes: 0,
      total: files.reduce((n, f) => n + f.bytes, 0),
      filesDone: 0,
      filesTotal: files.length,
    };
    let lastProgress = 0;
    const publish = (force = false) => {
      if (force || performance.now() - lastProgress > 100) {
        lastProgress = performance.now();
        progress({ ...state });
      }
    };
    const check = verifyPjskFile;
    const pending: File[] = [];
    for (const file of files) {
      signal.throwIfAborted();
      if (!isPjskSourceFile(file))
        throw new Error('Invalid source in pinned chapter recipe.');
      const cached = await cache.match(file.url);
      if (
        cached &&
        (await check(new Uint8Array(await cached.arrayBuffer()), file))
      ) {
        state.bytes += file.bytes;
        state.filesDone++;
      } else pending.push(file);
    }
    const space = await navigator.storage?.estimate?.();
    const needed = pending.reduce((n, f) => n + f.bytes, 0) + 1024 * 1024;
    if (
      space?.quota !== undefined &&
      space.usage !== undefined &&
      space.quota - space.usage < needed
    )
      throw new Error(
        'Not enough browser storage for this chapter. Free some space and retry.',
      );
    signal.throwIfAborted();
    void navigator.storage?.persist?.().catch(() => false);
    publish(true);
    const failure = new AbortController();
    const combined = AbortSignal.any([signal, failure.signal]);
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const file = pending[next++];
        combined.throwIfAborted();
        try {
          await withMediaLock(
            `onlystory:asset:${file.url}`,
            combined,
            async () => {
              // Another window may have completed it while this one waited.
              const shared = await cache.match(file.url);
              if (
                shared &&
                (await check(new Uint8Array(await shared.arrayBuffer()), file))
              ) {
                state.bytes += file.bytes;
                state.filesDone++;
                publish(true);
                return;
              }
              const response = await fetch(file.sourceUrl!, {
                credentials: 'omit',
                signal: AbortSignal.any([combined, AbortSignal.timeout(60000)]),
              });
              if (response.status !== 200 || !response.body)
                throw new Error(`Source returned ${response.status}.`);
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let received = 0;
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  combined.throwIfAborted();
                  received += value.byteLength;
                  state.bytes += value.byteLength;
                  if (received > file.bytes)
                    throw new Error('The source file changed.');
                  chunks.push(value);
                  publish();
                }
              } finally {
                await reader.cancel().catch(() => {});
                reader.releaseLock();
              }
              const bytes = new Uint8Array(received);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
              }
              if (!(await check(bytes, file)))
                throw new Error(
                  'The source file changed or failed its checksum.',
                );
              combined.throwIfAborted();
              const mime = file.sourceUrl!.endsWith('.asset')
                ? 'application/json'
                : file.url.endsWith('.png')
                  ? 'image/png'
                  : file.url.endsWith('.webp')
                    ? 'image/webp'
                    : file.url.endsWith('.mp3')
                      ? 'audio/mpeg'
                      : file.url.endsWith('.json')
                        ? 'application/json'
                        : 'application/octet-stream';
              await cache.put(
                file.url,
                new Response(bytes, {
                  headers: {
                    'Content-Type': mime,
                    'Content-Length': String(bytes.length),
                  },
                }),
              );
              state.filesDone++;
              publish(true);
            },
          );
        } catch (error) {
          if (combined.aborted) throw error;
          const reason =
            error instanceof Error ? error.message : 'Network request failed.';
          const problem = new Error(
            `PJSK download failed: ${reason} Retry to reuse saved files.`,
          );
          failure.abort(problem);
          throw problem;
        }
      }
    };
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(3, pending.length) }, worker),
    );
    signal.throwIfAborted();
    if (failure.signal.aborted) throw failure.signal.reason;
    for (const result of results)
      if (result.status === 'rejected') throw result.reason;
    const putGenerated = async (url: string, value: unknown) => {
      signal.throwIfAborted();
      const bytes = encode(value);
      if ((await hash(bytes)) !== expectedHash(url))
        throw new Error(
          'Prepared chapter differs from the reviewed recipe. The app needs an updated recipe.',
        );
      await cache.put(
        url,
        new Response(bytes, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(bytes.length),
          },
        }),
      );
    };
    for (const model of recipe.models) {
      const original = await (await cache.match(model.original))?.json();
      await putGenerated(model.target, rewriteModel(original, model, recipe));
    }
    const original = await (await cache.match(recipe.scenario.url))?.json();
    const { program, text } = compileChapter(original, recipe);
    await putGenerated(recipe.program.url, program);
    await putGenerated(recipe.text.url, text);
    signal.throwIfAborted();
    return [
      ...new Set([
        recipe.scenario.url,
        ...mediaFiles.map((f) => f.url),
        ...(recipe.extraFiles ?? []).map((f) => f.url),
        recipe.text.url,
        recipe.program.url,
      ]),
    ];
  } finally {
    release();
  }
}
