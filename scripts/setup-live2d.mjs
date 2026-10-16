import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = resolve(root, 'public/vendor/live2dcubismcore.min.js');
const source =
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
if (!existsSync(destination)) {
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`Live2D Core download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.toString('utf8', 0, 350).includes('Live2D Cubism Core'))
    throw new Error('The official runtime response was not Cubism Core.');
  mkdirSync(resolve(root, 'public/vendor'), { recursive: true });
  writeFileSync(destination, bytes);
}
const bytes = readFileSync(destination);
writeFileSync(
  resolve(root, 'public/vendor/live2d-provenance.json'),
  JSON.stringify(
    {
      source,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      license:
        'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Local Live2D Core ready (${bytes.length} bytes).`);
