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
  const cache = await caches.open(MEDIA_CACHE);
  const response = await fetch(INDEX);
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
    // Large movies remain usable through old keys; do not hold them in a JS
    // buffer merely to migrate an existing download.
    const length = Number(old.headers.get('content-length'));
    if (!length || length > 16 * 1024 * 1024) continue;
    const bytes = await old.clone().arrayBuffer();
    const actual = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (n) => n.toString(16).padStart(2, '0'),
    ).join('');
    if (actual !== expected) continue;
    if (!(await cache.match(target))) await cache.put(target, old);
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
    const size =
      Number(existing.headers.get('content-length')) ||
      (await existing.blob()).size;
    progress(size, size);
    return size;
  }
  signal.throwIfAborted();
  let job = jobs.get(path);
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
        controller.signal.throwIfAborted();
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
          path,
          new Response(body, { headers: response.headers }),
        );
        if (controller.signal.aborted) {
          await cache.delete(path);
          controller.signal.throwIfAborted();
        }
        return current.bytes;
      } finally {
        release();
        if (jobs.get(path) === current) jobs.delete(path);
      }
    })();
    jobs.set(path, current);
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
        female?: { url: string; voices?: Record<string, { url: string }> };
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
    }
    const asset = gender === 'female' && movie.female ? movie.female : movie;
    const url = asset.voices?.[voice]?.url ?? asset.url;
    if (url) selected.add(url);
  }
  return program.files
    .map((file) => file.url)
    .filter((url) => !excluded.has(url) || selected.has(url));
}
