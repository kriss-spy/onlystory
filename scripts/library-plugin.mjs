import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryMiddleware } from './library-server.mjs';
import { libraryRoot, pjskLibraryRoot } from './local-environment.mjs';
export function libraryPlugin() {
  return {
    name: 'onlystory-library',
    configureServer(server) {
      server.middlewares.use(
        libraryMiddleware(libraryRoot, undefined, [pjskLibraryRoot]),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        libraryMiddleware(libraryRoot, undefined, [pjskLibraryRoot]),
      );
    },
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      for (const name of ['demo', 'vendor', 'favicon.svg'])
        cpSync(resolve('public', name), resolve('dist', name), {
          recursive: true,
        });
    },
  };
}
