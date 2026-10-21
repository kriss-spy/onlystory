import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export async function staticHost() {
  fs.mkdirSync('.cache', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.cache/static-test-'));
  fs.cpSync(path.resolve(process.env.ONLYSTORY_STATIC_DIST || 'dist'), root, {
    recursive: true,
  });
  const privateRequests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    if (url.pathname.startsWith('/private/')) {
      privateRequests.push(url.pathname);
      response.writeHead(404).end();
      return;
    }
    let file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!path.extname(url.pathname)) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const types: Record<string, string> = {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.webmanifest': 'application/manifest+json',
    };
    response.setHeader(
      'Content-Type',
      types[path.extname(file)] ?? 'application/octet-stream',
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    privateRequests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      if (root.startsWith(path.resolve('.cache') + path.sep))
        fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
