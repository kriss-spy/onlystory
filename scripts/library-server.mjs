import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const types = {
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};

export function libraryMiddleware(publicRoot, frontendRoot) {
  let indexTime = -1,
    aliases = {};
  return (
    req,
    res,
    next = () => {
      res.statusCode = 404;
      res.end('Not found');
    },
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
    const base = pathname.startsWith('/private/') ? publicRoot : frontendRoot;
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
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const publicRoot = resolve(
    process.env.ONLYSTORY_LIBRARY || resolve(root, 'public'),
  );
  const port = Number(process.env.PORT || 4173);
  createServer(libraryMiddleware(publicRoot, resolve(root, 'dist'))).listen(
    port,
    '127.0.0.1',
    () => console.log(`Onlystory: http://127.0.0.1:${port}`),
  );
}
