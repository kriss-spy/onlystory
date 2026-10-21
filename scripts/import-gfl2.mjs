import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importFullEvent } from './gfl2-event.mjs';
import { importScenes } from './gfl2-scenes.mjs';
import { importIlion } from './gfl2-ilion.mjs';
import { shareGameAssets } from './storage-library.mjs';
import { eventSpecs, importEventPackage } from './gfl2-event-package.mjs';
import { shareMovieStreams } from './share-movie-streams.mjs';
import { readdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(
  process.env.ONLYSTORY_GFL2_PROTOTYPE ||
    resolve(root, '../onlystory-gfl2/prototype'),
);
const generated = resolve(root, 'src/generated/gfl2-opening.json');
importFullEvent(root, source);
const packages = eventSpecs(root);
for (const spec of packages) importEventPackage(root, spec);
for (const directory of readdirSync(resolve(root, 'public/private'))) {
  if (!directory.startsWith('gfl2-')) continue;
  const manifest = resolve(
    root,
    'public/private',
    directory,
    'videos/manifest.json',
  );
  if (existsSync(manifest)) shareMovieStreams(manifest);
}
shareGameAssets(root);
importScenes(root, source);
importIlion(root);
importScenes(root, source, { event: 'gfl2-ilion' });
const packageCatalog = [];
for (const spec of packages) {
  importScenes(root, source, { event: spec.id });
  const eventPath = resolve(root, `src/generated/${spec.id}.json`);
  const scenePath = resolve(root, `src/generated/${spec.id}-scenes.json`);
  const event = existsSync(eventPath)
    ? JSON.parse(readFileSync(eventPath, 'utf8'))
    : null;
  const scenes = existsSync(scenePath)
    ? JSON.parse(readFileSync(scenePath, 'utf8'))
    : null;
  if (event) packageCatalog.push({ event, scenes });
}
writeFileSync(
  resolve(root, 'src/generated/gfl2-packages.json'),
  JSON.stringify(packageCatalog, null, 2) + '\n',
);
mkdirSync(dirname(generated), { recursive: true });
const opening = resolve(source, 'opening.json');
if (!existsSync(opening)) {
  if (!existsSync(generated)) writeFileSync(generated, 'null\n');
  console.log(
    'GFL2 import: no prototype found. Set ONLYSTORY_GFL2_PROTOTYPE to its directory.',
  );
  process.exit(0);
}
const bytes = readFileSync(opening);
const data = JSON.parse(bytes.toString('utf8'));
const supported = new Set([
  'ChangeMessageWindow',
  'Bg',
  'BgOff',
  'Bgm',
  'Se',
  'StopBgm',
  'StopSe',
  'Tween',
  'SetShaderFloat',
  'ChangeLayer',
  'Wait',
]);
for (const step of data.steps ?? [])
  for (const command of step.commands ?? []) {
    if (
      !supported.has(command.Command) ||
      (command.Command === 'Tween' && command.Arg2 !== 'PunchPosition') ||
      (command.Command === 'SetShaderFloat' &&
        !['_MaskHeight', '_DarkRampMask'].includes(command.Arg2))
    )
      throw new Error(
        `Unsupported source command at row ${command.sourceRow}. Do not silently skip it.`,
      );
  }
if (
  data.coverage?.script !== 'A33001' ||
  data.steps?.length !== 12 ||
  data.steps.some((s, i) => s.source?.contentId !== 233001001 + i)
)
  throw new Error(
    'The prototype opening does not match the verified twelve-passage excerpt.',
  );
const assets = new Map();
const mediaFile = resolve(
  root,
  'public/private/gfl2-event/media/manifest.json',
);
const media = existsSync(mediaFile)
  ? JSON.parse(readFileSync(mediaFile, 'utf8'))
  : null;
const recovered = new Map((media?.files ?? []).map((file) => [file.url, file]));
if (media?.audio && Object.keys(media.audio).length) {
  // Old excerpt URLs remain supported, but must not keep using the prototype's
  // faulty HCA decodes after the full-event media has been recovered.
  for (const label of Object.keys(data.assets.audio)) {
    if (!media.audio[label])
      throw new Error(`Recovered audio missing: ${label}`);
    data.assets.audio[label] = structuredClone(media.audio[label]);
  }
}
function visit(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.url === 'string') {
    const path = value.url;
    const shared = recovered.get(path);
    if (shared) {
      const pathname = new URL(path, 'http://localhost').pathname;
      if (
        !pathname.startsWith('/private/gfl2-event/media/') &&
        !pathname.startsWith('/private/shared/')
      )
        throw new Error(`Unexpected recovered media path: ${path}`);
      const bytes = readFileSync(resolve(root, `public${pathname}`));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== shared.bytes || sha256 !== shared.sha256)
        throw new Error(`Recovered media hash mismatch: ${path}`);
      assets.set(path, { url: path, bytes: bytes.length, sha256 });
      Object.values(value).forEach(visit);
      return;
    }
    const local = resolve(source, path);
    const rel = relative(source, local);
    if (isAbsolute(rel) || rel.startsWith('..') || !path.startsWith('assets/'))
      throw new Error(`Unexpected local media path: ${path}`);
    const media = readFileSync(local);
    const sha256 = createHash('sha256').update(media).digest('hex');
    if (value.outputSha256 && value.outputSha256 !== sha256)
      throw new Error(`Recovered media hash mismatch: ${path}`);
    const destination = resolve(root, 'public/private/gfl2-opening', path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(local, destination);
    const url = `/private/gfl2-opening/${path}`;
    assets.set(url, { url, bytes: media.length, sha256 });
    value.url = url;
  }
  Object.values(value).forEach(visit);
}
visit(data.assets);
data.importedFrom = {
  openingSha256: createHash('sha256').update(bytes).digest('hex'),
  files: [...assets.values()],
};
writeFileSync(generated, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync(
  resolve(root, 'public/private/gfl2-opening/provenance.json'),
  `${JSON.stringify(data.importedFrom, null, 2)}\n`,
);
console.log(
  `GFL2 import: ${data.steps.length} original passages, ${assets.size} verified local media files.`,
);
