import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Run after the library plugin copies the local playback runtimes. Never walk
// public/private: game libraries are downloaded explicitly by the reader.
export function pwaPlugin() {
  let output;
  return {
    name: 'onlystory-pwa',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      handler() {
        const files = [];
        function visit(directory, prefix = '') {
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = `${prefix}/${entry.name}`;
            if (entry.name === 'sw.js' || entry.name === 'private') continue;
            if (entry.isDirectory())
              visit(resolve(directory, entry.name), path);
            // Chapter recipes are verified and cached when selected. Installing
            // the shell must not request every chapter's download instructions.
            else if (!(
              /^(?:pjsk|ba)-/.test(entry.name) && entry.name.endsWith('.gz')
            ))
              files.push(path);
          }
        }
        visit(output);
        files.sort();
        const source = readFileSync(
          new URL('./service-worker.js', import.meta.url),
          'utf8',
        );
        const hash = createHash('sha256').update(source);
        for (const file of files) {
          hash.update(file);
          hash.update(readFileSync(resolve(output, '.' + file)));
        }
        const version = hash.digest('hex').slice(0, 20);
        writeFileSync(
          resolve(output, 'sw.js'),
          source
            .replace('__SHELL_VERSION__', JSON.stringify(version))
            .replace('__SHELL_FILES__', JSON.stringify(files)),
        );
      },
    },
  };
}
