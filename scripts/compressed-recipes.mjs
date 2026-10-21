import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** Recipe pins identify compressed bytes. Vite otherwise advertises .gz as HTTP
 * content encoding, which makes fetch decompress before integrity checking. */
export function compressedRecipeMiddleware(root = process.cwd()) {
  return (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (
      !/^\/src\/downloads\/(?:pjsk-recipes|ba\/recipes)\/[\w.-]+\.json\.gz$/.test(
        url.pathname,
      ) ||
      url.searchParams.has('url') ||
      url.searchParams.has('import')
    )
      return next();
    if (!['GET', 'HEAD'].includes(request.method)) return next();
    const filename = resolve(root, '.' + url.pathname);
    let size;
    try {
      size = statSync(filename).size;
    } catch {
      response.writeHead(404).end('Recipe not found');
      return;
    }
    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader('Content-Length', size);
    response.setHeader('Cache-Control', 'no-cache');
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(filename)
        .on('error', () => response.destroy())
        .pipe(response);
  };
}
