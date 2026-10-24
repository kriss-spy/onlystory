import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip);

/** Keep large built catalogs inexpensive to load over the private remote link. */
export function previewCompression(root) {
  const directory = resolve(root);
  const assets = new Map();
  return async (req, res, next) => {
    if (
      !['GET', 'HEAD'].includes(req.method) ||
      !/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
    )
      return next();
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!/^\/assets\/[^/]+\.(?:js|css)$/.test(pathname)) return next();
    const filename = resolve(directory, '.' + pathname);
    if (!filename.startsWith(directory + sep)) return next();
    try {
      if (!assets.has(filename))
        assets.set(
          filename,
          readFile(filename).then((bytes) => compress(bytes)),
        );
      const bytes = await assets.get(filename);
      res.setHeader(
        'Content-Type',
        pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
      );
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', bytes.length);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      assets.delete(filename);
      next();
    }
  };
}
