import { sha256 } from '@noble/hashes/sha2.js';
import { withMediaLock } from './media-lock';
import type { MovieStreams } from './model';

export const MEDIA_CACHE = 'onlystory.media.v1';
type Progress = (bytes: number, total: number) => void;
interface Job {
  controller: AbortController;
  subscribers: Set<Progress>;
  promise: Promise<number>;
  bytes: number;
  total: number;
}
const jobs = new Map<string, Job>();
let active = 0;
const waiting: (() => void)[] = [];
const INDEX = '/private/shared/index.json';
let aliases: Promise<Record<string, string>> | undefined;
async function cachedAliases(cache: Cache) {
  return (aliases ??= (async () =>
    (await (await cache.match(INDEX))?.json())?.aliases ?? {})());
}
export async function canonicalMediaPath(cache: Cache, path: string) {
  const url = new URL(path, location.href);
  // Mutable chapter/scene URLs pin their revision in the query. Only a verified
  // alias can replace that identity with an immutable shared digest URL.
  return (
    (await cachedAliases(cache))[url.pathname] ?? url.pathname + url.search
  );
}
export async function responseBytes(response: Response) {
  const size = Number(response.headers.get('content-length'));
  if (size > 0) return size;
  let bytes = 0;
  const reader = response.body?.getReader();
  if (!reader) return bytes;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return bytes;
      bytes += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}
export async function matchMedia(
  cache: Cache | null | undefined,
  path: string,
) {
  if (!cache) return undefined;
  const direct = await cache.match(path);
  if (direct) return direct;
  const key = new URL(path, location.href).pathname;
  const target = (await cachedAliases(cache))[key];
  return target ? cache.match(target) : undefined;
}
export async function migrateMediaCache() {
  if (!('caches' in globalThis)) return;
  return withMediaLock(
    'onlystory:media-library',
    undefined,
    migrateMediaCacheLocked,
  );
}
async function migrateMediaCacheLocked() {
  const cache = await caches.open(MEDIA_CACHE);
  const response = await fetch(INDEX).catch(() => cache.match(INDEX));
  if (!response) return;
  if (!response.ok || !response.headers.get('content-type')?.includes('json'))
    return;
  const index = await response.clone().json();
  if (index.version !== 1 || !index.aliases) return;
  await cache.put(INDEX, response);
  aliases = Promise.resolve(index.aliases);
  for (const request of await cache.keys()) {
    const key = new URL(request.url).pathname;
    const target: string | undefined = index.aliases[key];
    const expected = target?.match(/^\/private\/shared\/([a-f0-9]{64})\./)?.[1];
    if (!target || !expected || key === target) continue;
    const old = await cache.match(request);
    if (!old) continue;
    // Hash one cache-backed stream, then reopen it for the copy. A cloned tee
    // would retain the whole movie while the hashing branch drains.
    const digest = sha256.create();
    const reader = old.body?.getReader();
    if (!reader) continue;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        digest.update(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const actual = Array.from(digest.digest(), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    if (actual !== expected) continue;
    const source = await cache.match(request);
    if (!source) continue;
    // The verified old copy also repairs an existing corrupted canonical entry.
    await cache.put(target, source);
    // Both current and previous scene URLs can resolve the canonical key.
    await cache.delete(request);
  }
}
async function slot() {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  return () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
}

/** One stream per asset across episode downloads, at most three active fetches.
 * A subscriber may cancel without cancelling another episode's shared transfer.
 */
export async function downloadAsset(
  cache: Cache,
  path: string,
  signal: AbortSignal,
  progress: Progress,
): Promise<number> {
  signal.throwIfAborted();
  const existing = await matchMedia(cache, path);
  if (existing) {
    const size = await responseBytes(existing);
    progress(size, size);
    return size;
  }
  signal.throwIfAborted();
  const identity = await canonicalMediaPath(cache, path);
  let job = jobs.get(identity);
  if (!job) {
    const controller = new AbortController();
    job = {
      controller,
      subscribers: new Set(),
      bytes: 0,
      total: 0,
      promise: Promise.resolve(0),
    };
    const current = job;
    current.promise = (async () => {
      const release = await slot();
      try {
        return await withMediaLock(
          `onlystory:asset:${identity}`,
          controller.signal,
          async () => {
            controller.signal.throwIfAborted();
            const shared = await matchMedia(cache, path);
            if (shared) {
              current.bytes = current.total = await responseBytes(shared);
              for (const listener of current.subscribers)
                listener(current.bytes, current.total);
              return current.bytes;
            }
            const response = await fetch(path, { signal: controller.signal });
            if (
              response.status !== 200 ||
              response.headers.get('content-type')?.includes('text/html') ||
              !response.body
            )
              throw Error(
                `The media file ${path.split('/').at(-1)} is unavailable.`,
              );
            current.total = Number(response.headers.get('content-length')) || 0;
            const body = response.body.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, output) {
                  controller.signal.throwIfAborted();
                  current.bytes += chunk.byteLength;
                  for (const listener of current.subscribers)
                    listener(current.bytes, current.total);
                  output.enqueue(chunk);
                },
              }),
            );
            await cache.put(
              identity,
              new Response(body, { headers: response.headers }),
            );
            if (controller.signal.aborted) {
              await cache.delete(identity);
              controller.signal.throwIfAborted();
            }
            return current.bytes;
          },
        );
      } finally {
        release();
        if (jobs.get(identity) === current) jobs.delete(identity);
      }
    })();
    jobs.set(identity, current);
  }
  const current = job;
  current.subscribers.add(progress);
  progress(current.bytes, current.total);
  try {
    return await new Promise<number>((resolve, reject) => {
      const abort = () =>
        reject(signal.reason ?? new DOMException('Canceled', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      void current.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  } finally {
    current.subscribers.delete(progress);
    if (!current.subscribers.size) current.controller.abort();
  }
}

export function selectedSceneFiles(
  program: {
    files: { url: string }[];
    videos?: Record<
      string,
      {
        url?: string;
        voices?: Record<string, { url: string }>;
        streams?: MovieStreams;
        female?: {
          url: string;
          voices?: Record<string, { url: string }>;
          streams?: MovieStreams;
        };
      }
    >;
  },
  voice: string,
  gender = 'male',
) {
  const excluded = new Set<string>();
  const selected = new Set<string>();
  for (const movie of Object.values(program.videos ?? {})) {
    for (const asset of [movie, movie.female].filter(Boolean)) {
      if (asset?.url) excluded.add(asset.url);
      for (const track of Object.values(asset?.voices ?? {}))
        excluded.add(track.url);
      if (asset?.streams)
        for (const track of [
          asset.streams.video,
          ...Object.values(asset.streams.audio),
        ]) {
          if (!track) continue;
          excluded.add(track.init.url);
          for (const segment of track.segments) excluded.add(segment.url);
        }
    }
    const asset = gender === 'female' && movie.female ? movie.female : movie;
    const streams = asset.streams;
    const audio = streams?.audio[voice as keyof MovieStreams['audio']];
    if (
      streams &&
      audio &&
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported(streams.video.mime) &&
      MediaSource.isTypeSupported(audio.mime)
    ) {
      for (const track of [streams.video, audio]) {
        selected.add(track.init.url);
        for (const segment of track.segments) selected.add(segment.url);
      }
    } else {
      const url = asset.voices?.[voice]?.url ?? asset.url;
      if (url) selected.add(url);
    }
  }
  return program.files
    .map((file) => file.url)
    .filter((url) => !excluded.has(url) || selected.has(url));
}
