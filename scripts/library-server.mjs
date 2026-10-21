import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPjskDeferred } from './pjsk-deferred.mjs';
import {
  libraryRoot,
  localPort,
  pjskLibraryRoot,
} from './local-environment.mjs';
const types = {
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export function libraryMiddleware(
  publicRoot,
  frontendRoot,
  additionalRoots = [],
  { deferredFetcher } = {},
) {
  let indexTime = -1,
    aliases = {};
  const deferredCaches = [...new Set([...additionalRoots, publicRoot])].map(
    (libraryDir) => ({
      libraryDir,
      cache: createPjskDeferred({
        libraryDir,
        ...(deferredFetcher ? { fetcher: deferredFetcher } : {}),
      }),
    }),
  );
  const serve = (
    req,
    res,
    next = () => {
      res.statusCode = 404;
      res.end('Not found');
    },
    privateRootOverride,
  ) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    if (pathname.startsWith('/private/')) {
      const index = resolve(publicRoot, 'private/shared/index.json');
      if (existsSync(index)) {
        const mtime = statSync(index).mtimeMs;
        if (mtime !== indexTime) {
          aliases = JSON.parse(readFileSync(index, 'utf8')).aliases;
          indexTime = mtime;
        }
      }
      pathname = aliases[pathname] ?? pathname;
    } else if (!frontendRoot) return next();
    const privateRoot = pathname.startsWith('/private/')
      ? (privateRootOverride ??
        additionalRoots.find((root) =>
          existsSync(resolve(root, '.' + pathname)),
        ) ??
        publicRoot)
      : null;
    const base = privateRoot ?? frontendRoot;
    let file = resolve(base, '.' + pathname);
    const rel = relative(base, file);
    if (isAbsolute(rel) || rel.startsWith('..')) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      // Missing media must never turn into the SPA's HTML response.
      if (pathname.startsWith('/private/') || extname(pathname)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      file = resolve(frontendRoot, 'index.html');
      if (!existsSync(file)) return next();
    }
    const stat = statSync(file),
      size = stat.size;
    res.setHeader(
      'Content-Type',
      types[extname(file)] ?? 'application/octet-stream',
    );
    res.setHeader('Accept-Ranges', 'bytes');
    if (
      pathname === '/sw.js' ||
      pathname === '/manifest.webmanifest' ||
      extname(file) === '.html'
    )
      res.setHeader('Cache-Control', 'no-cache');
    if (/\/shared\/[a-f0-9]{64}\./.test(pathname))
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    let start = 0,
      end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
      }
      if (
        !match ||
        (!match[1] && !match[2]) ||
        start > end ||
        start >= size ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end)
      ) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', Math.max(0, end - start + 1));
    if (req.method === 'HEAD' || size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };
  return (req, res, next) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname,
      );
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    if (
      pathname === '/onlystory-local-library.json' &&
      ['GET', 'HEAD'].includes(req.method)
    ) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        req.method === 'HEAD'
          ? undefined
          : JSON.stringify({ version: 1, localLibrary: true }),
      );
      return;
    }
    if (
      !pathname.startsWith('/private/pjsk/remote/') ||
      !['GET', 'HEAD'].includes(req.method)
    )
      return serve(req, res, next);
    const controller = new AbortController();
    const cleanup = () => {
      req.removeListener('aborted', abandoned);
      res.removeListener('close', closed);
      res.removeListener('finish', cleanup);
    };
    const abandoned = () => {
      controller.abort(
        new DOMException('Audio client disconnected', 'AbortError'),
      );
      cleanup();
    };
    const closed = () => {
      if (!res.writableFinished) abandoned();
      else cleanup();
    };
    req.once('aborted', abandoned);
    res.once('close', closed);
    res.once('finish', cleanup);
    void (async () => {
      for (const { cache, libraryDir } of deferredCaches) {
        if (await cache.ensure(pathname, { signal: controller.signal }))
          return serve(req, res, next, libraryDir);
      }
      res.statusCode = 404;
      res.end('Not found');
    })().catch((error) => {
      if (res.destroyed || controller.signal.aborted) return;
      res.statusCode = error.status ?? 503;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Audio is unavailable');
    });
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const publicRoot = libraryRoot;
  const port = localPort;
  createServer(
    libraryMiddleware(publicRoot, resolve(root, 'dist'), [pjskLibraryRoot]),
  ).listen(port, '127.0.0.1', () =>
    console.log(`Onlystory: http://127.0.0.1:${port}`),
  );
}
