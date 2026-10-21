import fs from 'node:fs';
import path from 'node:path';
import {
  ZipWriter,
  Uint8ArrayWriter,
  Uint8ArrayReader,
  configure,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });
const writer = new ZipWriter(new Uint8ArrayWriter());
async function add(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'private')
      throw Error(
        'A standalone web release must not contain game asset files.',
      );
    const file = path.join(directory, entry.name),
      name = prefix + entry.name;
    if (entry.isDirectory()) await add(file, name + '/');
    else await writer.add(name, new Uint8ArrayReader(fs.readFileSync(file)));
  }
}
await add('dist');
await writer.add(
  'serve.mjs',
  new Uint8ArrayReader(fs.readFileSync('scripts/serve-web.mjs')),
);
await writer.add(
  'START-HERE.txt',
  new Uint8ArrayReader(
    new TextEncoder().encode(
      'Onlystory web app (Linux and Windows)\n\nInstall Node.js 22.12 or newer. Extract this archive, open a terminal here, and run:\n\n  node serve.mjs\n\nOpen http://127.0.0.1:4173 in Chrome or Chromium. Keep the terminal open during initial setup and downloads. Do not open index.html through file://.\n\nBA requires original-file imports in the browser. PJSK supports downloads. GFL1/2 require a separate prepared library host and are pending here. Progress and downloads are specific to this browser profile and address.\n\nPublic hosting requires HTTPS and SPA fallback. Missing /private/ files must return 404. This local runner listens on loopback only.\n',
    ),
  ),
);
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/Onlystory-web.zip', await writer.close());
console.log(
  'Saved release/Onlystory-web.zip. Serve over HTTPS for installation and offline launch.',
);
