import { createServer as createHttpServer } from 'node:http';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { libraryMiddleware } from './library-server.mjs';
import { compressedRecipeMiddleware } from './compressed-recipes.mjs';
import {
  libraryRoot,
  localPort,
  pjskLibraryRoot,
} from './local-environment.mjs';

// UI navigation exercises an immutable production build. Renderer/audio probes
// also import source modules directly, so retain Vite transforms for those URLs.
// A separate snapshot prevents another build from removing files mid-test.
mkdirSync('.cache', { recursive: true });
const frontendRoot = mkdtempSync(resolve('.cache/browser-build-'));
cpSync(resolve(process.env.ONLYSTORY_BROWSER_DIST || 'dist'), frontendRoot, {
  recursive: true,
});
const vite = await createViteServer({
  // Loading vite.config.ts would merge its watch object over watch:null and
  // start watching the private media library during a long verification run.
  configFile: false,
  // Verification must not replace the dependency files of a running dev server.
  cacheDir: 'node_modules/.vite-browser',
  appType: 'custom',
  optimizeDeps: {
    noDiscovery: true,
    include: ['pixi.js', 'pixi-live2d-display/cubism4'],
  },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const library = libraryMiddleware(libraryRoot, frontendRoot, [pjskLibraryRoot]);
const compressedRecipes = compressedRecipeMiddleware();
const server = createHttpServer((req, res) => {
  compressedRecipes(req, res, () => {
    if (/^\/(?:src\/|node_modules\/|@)/.test(req.url ?? ''))
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end('Test module not found');
      });
    else library(req, res);
  });
});
server.listen(localPort, '127.0.0.1', () => {
  console.log(`Browser verification: http://127.0.0.1:${localPort}`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    server.close();
    await vite.close();
    process.exit(0);
  });
