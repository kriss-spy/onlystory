import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryMiddleware } from './library-server.mjs';
import { libraryRoot, pjskLibraryRoot } from './local-environment.mjs';
import { compressedRecipeMiddleware } from './compressed-recipes.mjs';
export function libraryPlugin() {
  let output;
  return {
    name: 'onlystory-library',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(compressedRecipeMiddleware());
      server.middlewares.use('/vendor/ffmpeg', (req, res, next) => {
        const name = req.url?.split('?')[0]?.slice(1);
        const files = {
          'ffmpeg-core.js': '@ffmpeg/core/dist/esm/ffmpeg-core.js',
          'ffmpeg-core.wasm': '@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
          'worker.js': '@ffmpeg/ffmpeg/dist/esm/worker.js',
          'const.js': '@ffmpeg/ffmpeg/dist/esm/const.js',
          'errors.js': '@ffmpeg/ffmpeg/dist/esm/errors.js',
        };
        if (!Object.hasOwn(files, name ?? '')) return next();
        import('node:fs').then(({ readFile }) =>
          readFile(resolve('node_modules', files[name]), (error, bytes) => {
            if (error) return next(error);
            res.setHeader(
              'Content-Type',
              name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
            );
            res.end(bytes);
          }),
        );
      });
      server.middlewares.use('/vendor/sqlite', (req, res, next) => {
        if (req.url?.split('?')[0] !== '/sql-wasm.wasm') return next();
        import('node:fs').then(({ readFile }) =>
          readFile(
            resolve('node_modules/sql.js/dist/sql-wasm.wasm'),
            (error, bytes) => {
              if (error) return next(error);
              res.setHeader('Content-Type', 'application/wasm');
              res.end(bytes);
            },
          ),
        );
      });
      server.middlewares.use('/vendor/texture2ddecoder', (req, res, next) => {
        const name = req.url?.split('?')[0]?.slice(1);
        if (!['texture2ddecoder.js', 'texture2ddecoder.wasm'].includes(name))
          return next();
        import('node:fs').then(({ readFile }) =>
          readFile(
            resolve('node_modules/texture2ddecoder-wasm/wasm', name),
            (error, bytes) => {
              if (error) return next(error);
              res.setHeader(
                'Content-Type',
                name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
              );
              res.end(bytes);
            },
          ),
        );
      });
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
      mkdirSync(output, { recursive: true });
      for (const name of [
        'demo',
        'vendor',
        'favicon.svg',
        'icons',
        'manifest.webmanifest',
      ])
        cpSync(resolve('public', name), resolve(output, name), {
          recursive: true,
        });
      cpSync(
        resolve('node_modules/texture2ddecoder-wasm/wasm'),
        resolve(output, 'vendor/texture2ddecoder'),
        { recursive: true },
      );
      mkdirSync(resolve(output, 'vendor/sqlite'), { recursive: true });
      cpSync(
        resolve('node_modules/sql.js/dist/sql-wasm.wasm'),
        resolve(output, 'vendor/sqlite/sql-wasm.wasm'),
      );
      mkdirSync(resolve(output, 'vendor/ffmpeg'), { recursive: true });
      for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm'])
        cpSync(
          resolve('node_modules/@ffmpeg/core/dist/esm', name),
          resolve(output, 'vendor/ffmpeg', name),
        );
      for (const name of ['worker.js', 'const.js', 'errors.js'])
        cpSync(
          resolve('node_modules/@ffmpeg/ffmpeg/dist/esm', name),
          resolve(output, 'vendor/ffmpeg', name),
        );
      for (const name of [
        'unity-asset-reader',
        'unity-asset-reader-texture',
        'texture2ddecoder-wasm',
        'fflate',
        'lzma1',
        '@zip.js/zip.js',
        '@noble/hashes',
        'sql.js',
        '@ffmpeg/core',
        '@ffmpeg/ffmpeg',
      ]) {
        for (const license of ['LICENSE', 'LICENSE-APACHE', 'NOTICE']) {
          const from = resolve('node_modules', name, license);
          if (existsSync(from))
            cpSync(
              from,
              resolve(
                output,
                'vendor',
                name.replaceAll('/', '-').replace('@', '') +
                  '-' +
                  license +
                  '.txt',
              ),
            );
        }
      }
      cpSync(
        resolve('src/downloads/ba/vorbis/LICENSE'),
        resolve(output, 'vendor/python-fsb5-LICENSE.txt'),
      );
    },
  };
}
