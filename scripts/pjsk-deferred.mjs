import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const digest = (algorithm, bytes) =>
  createHash(algorithm).update(bytes).digest('hex');
const pending = new Map();
const verified = new Map();
let active = 0,
  nextRequestAt = 0,
  cooldownUntil = 0;
const waiters = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));
function canceled(signal) {
  return (
    signal.reason ?? new DOMException('Audio request canceled', 'AbortError')
  );
}
async function wait(ms, signal) {
  signal.throwIfAborted();
  if (ms <= 0) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(canceled(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
function failure(message, status = 502) {
  return Object.assign(new Error(message), { status });
}
async function slot(signal) {
  signal.throwIfAborted();
  if (active >= 4)
    await new Promise((resolve, reject) => {
      const waiter = {
        resolve: () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
      };
      const abort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(canceled(signal));
      };
      signal.addEventListener('abort', abort, { once: true });
      waiters.push(waiter);
    });
  else active++;
  try {
    while (true) {
      signal.throwIfAborted();
      const due = Math.max(Date.now(), nextRequestAt, cooldownUntil);
      if (due > Date.now()) {
        await wait(due - Date.now(), signal);
        continue;
      }
      // Claim only a slot that starts now. Reserving future slots would leave
      // canceled passages delaying the live clip even after leaving the queue.
      nextRequestAt = Date.now() + 125;
      return;
    }
  } catch (error) {
    release();
    throw error;
  }
}
function release() {
  const waiter = waiters.shift();
  if (waiter) waiter.resolve();
  else active--;
}

export function validateDeferredAudio(record, pathname) {
  if (
    !record ||
    record.url !== pathname ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes <= 0 ||
    !/^[a-f0-9]{32}$/.test(record.md5)
  )
    throw failure('Invalid deferred audio metadata');
  let source;
  try {
    source = new URL(record.sourceUrl);
  } catch {
    throw failure('Invalid deferred audio source');
  }
  if (
    source.href !== record.sourceUrl ||
    source.protocol !== 'https:' ||
    source.hostname !== 'storage.sekai.best' ||
    source.port ||
    source.search ||
    source.hash ||
    source.username ||
    source.password ||
    !/^\/sekai-jp-assets\/sound\/[a-zA-Z0-9_./%-]+\.mp3$/.test(source.pathname)
  )
    throw failure('Untrusted deferred audio source');
  let decoded;
  try {
    decoded = decodeURIComponent(source.pathname);
  } catch {
    throw failure('Invalid deferred audio encoding');
  }
  if (
    decoded.split('/').some((part) => part === '..' || part === '.') ||
    decoded.includes('\\')
  )
    throw failure('Invalid deferred audio path');
  const expected = `/private/pjsk/remote/${digest('sha256', record.sourceUrl)}.mp3`;
  if (pathname !== expected) throw failure('Deferred audio URL hash mismatch');
  if (
    record.cacheSource !== undefined &&
    !/^\/private\/pjsk\/assets\/[a-f0-9]{64}\.mp3$/.test(record.cacheSource)
  )
    throw failure('Invalid deferred audio cache source');
}

export function createPjskDeferred({ libraryDir, fetcher = fetch }) {
  const root = resolve(libraryDir);
  const manifestPath = resolve(root, 'private/pjsk/deferred.json');
  let manifest = {},
    manifestStamp = '';
  async function store(record, path, bytes, writeAudio = true) {
    const sha256 = digest('sha256', bytes);
    await mkdir(resolve(root, 'private/pjsk/remote'), { recursive: true });
    async function atomicWrite(destination, contents) {
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, contents);
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(temporary, destination);
            break;
          } catch (error) {
            if (
              attempt === 4 ||
              !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
            )
              throw error;
            await sleep(25 * 2 ** attempt);
          }
        }
      } finally {
        await unlink(temporary).catch(() => {});
      }
    }
    if (writeAudio) await atomicWrite(path, bytes);
    await atomicWrite(
      `${path}.json`,
      JSON.stringify(
        { ...record, sha256, cachedAt: new Date().toISOString() },
        null,
        2,
      ) + '\n',
    );
    return path;
  }
  async function descriptor(pathname) {
    let info;
    try {
      info = await stat(manifestPath);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    const stamp = `${info.mtimeMs}:${info.size}`;
    if (stamp !== manifestStamp) {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifestStamp = stamp;
    }
    const hash = /^\/private\/pjsk\/remote\/([a-f0-9]{64})\.mp3$/.exec(
      pathname,
    )?.[1];
    const record = hash ? manifest[hash] : null;
    if (!record) return null;
    validateDeferredAudio(record, pathname);
    return record;
  }
  async function download(record, path, signal) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await slot(signal);
      try {
        const response = await fetcher(record.sourceUrl, {
          redirect: 'error',
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        });
        signal.throwIfAborted();
        if (response.status === 429) {
          const retry = response.headers.get('retry-after');
          const delay = /^\d+$/.test(retry ?? '')
            ? Number(retry) * 1000
            : Date.parse(retry ?? '') - Date.now();
          cooldownUntil = Math.max(
            cooldownUntil,
            Date.now() +
              Math.max(
                Number.isFinite(delay) ? delay : 0,
                Math.min(60000, 5000 * 2 ** attempt),
              ),
          );
          throw failure('Audio source rate limited', 503);
        }
        if (!response.ok)
          throw failure(
            `Audio source HTTP ${response.status}`,
            response.status === 404 ? 404 : 502,
          );
        if (/html|xml/i.test(response.headers.get('content-type') ?? ''))
          throw failure('Audio source returned an error document');
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          signal.throwIfAborted();
          size += chunk.length;
          if (size > record.bytes)
            throw failure('Deferred audio size mismatch');
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (
          bytes.length !== record.bytes ||
          digest('md5', bytes) !== record.md5
        )
          throw failure('Deferred audio checksum mismatch');
        signal.throwIfAborted();
        return await store(record, path, bytes);
      } catch (error) {
        if (signal.aborted) throw canceled(signal);
        if (
          attempt === 3 ||
          /checksum mismatch|size mismatch|error document/.test(
            error.message,
          ) ||
          error.status === 404
        )
          throw error;
        if (error.status !== 503) await wait(250 * 2 ** attempt, signal);
      } finally {
        release();
      }
    }
  }
  return {
    async ensure(pathname, { signal } = {}) {
      signal?.throwIfAborted();
      const record = await descriptor(pathname);
      signal?.throwIfAborted();
      if (!record) return null;
      const path = resolve(root, '.' + pathname);
      const identity = `${record.md5}:${record.bytes}`;
      let info;
      try {
        info = await stat(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const stamp = info ? `${identity}:${info.mtimeMs}:${info.size}` : null;
      signal?.throwIfAborted();
      if (info && verified.get(path) === stamp) return path;
      let job = pending.get(path);
      if (job?.controller.signal.aborted) job = null;
      if (!job) {
        job = {
          controller: new AbortController(),
          subscribers: new Set(),
          done: false,
        };
        const current = job;
        const runSignal = current.controller.signal;
        current.promise = (async () => {
          if (info) {
            const bytes = await readFile(path);
            runSignal.throwIfAborted();
            if (
              bytes.length === record.bytes &&
              digest('md5', bytes) === record.md5
            ) {
              let provenance;
              try {
                provenance = JSON.parse(await readFile(`${path}.json`, 'utf8'));
              } catch (error) {
                if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
                  throw error;
              }
              if (
                provenance?.sha256 !== digest('sha256', bytes) ||
                provenance?.sourceUrl !== record.sourceUrl ||
                provenance?.md5 !== record.md5 ||
                provenance?.bytes !== record.bytes
              )
                await store(record, path, bytes, false);
              verified.set(path, stamp);
              return path;
            }
          }
          let cachedSource;
          if (record.cacheSource) {
            try {
              cachedSource = await readFile(
                resolve(root, '.' + record.cacheSource),
              );
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
            }
          }
          if (cachedSource) {
            runSignal.throwIfAborted();
            if (
              cachedSource.length !== record.bytes ||
              digest('md5', cachedSource) !== record.md5 ||
              !record.cacheSource.includes(digest('sha256', cachedSource))
            )
              throw failure('Deferred cached source checksum mismatch');
            await store(record, path, cachedSource);
          } else await download(record, path, runSignal);
          const installed = await stat(path);
          verified.set(
            path,
            `${identity}:${installed.mtimeMs}:${installed.size}`,
          );
          return path;
        })().finally(() => {
          current.done = true;
          if (pending.get(path) === current) pending.delete(path);
        });
        void current.promise.catch(() => {});
        pending.set(path, current);
      }
      const current = job;
      const subscriber = Symbol();
      current.subscribers.add(subscriber);
      return await new Promise((resolve, reject) => {
        const cleanup = () => {
          signal?.removeEventListener('abort', abort);
          current.subscribers.delete(subscriber);
          if (!current.done && current.subscribers.size === 0)
            current.controller.abort(
              new DOMException(
                'No audio request subscribers remain',
                'AbortError',
              ),
            );
        };
        const abort = () => {
          cleanup();
          reject(canceled(signal));
        };
        signal?.addEventListener('abort', abort, { once: true });
        void current.promise.then(
          (value) => {
            cleanup();
            resolve(value);
          },
          (error) => {
            cleanup();
            reject(error);
          },
        );
        if (signal?.aborted) abort();
      });
    },
  };
}
