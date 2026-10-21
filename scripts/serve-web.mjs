import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = existsSync(resolve(here, 'index.html'))
  ? here
  : resolve(here, '../dist');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('Invalid PORT');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip',
};
createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    let file = resolve(root, '.' + pathname);
    if (
      (file !== root && !file.startsWith(root + sep)) ||
      pathname.startsWith('/private/')
    ) {
      res.writeHead(404).end('Not found');
      return;
    }
    if (pathname === '/') file = resolve(root, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (extname(pathname) || pathname.startsWith('/private/')) {
        res.writeHead(404).end('Not found');
        return;
      }
      file = resolve(root, 'index.html');
    }
    const size = statSync(file).size;
    res.setHeader(
      'Content-Type',
      types[extname(file)] || 'application/octet-stream',
    );
    res.setHeader('Content-Length', size);
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400).end('Bad request');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Onlystory web: http://127.0.0.1:${port}`),
);
