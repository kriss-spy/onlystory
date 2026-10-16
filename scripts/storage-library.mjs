import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventSpecs } from './gfl2-event-package.mjs';

export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export function atomicJSON(path, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
export function publicFile(root, url) {
  if (!url.startsWith('/') || url.startsWith('//') || /[?#]/.test(url))
    throw Error(`Invalid local asset URL: ${url}`);
  const base = resolve(root, 'public');
  const path = resolve(base, decodeURIComponent(url.slice(1)));
  const rel = relative(base, path);
  if (isAbsolute(rel) || rel.startsWith('..'))
    throw Error('Asset escaped public directory');
  return path;
}
export function rewrite(value, aliases) {
  if (typeof value === 'string') return aliases[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => rewrite(item, aliases));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewrite(item, aliases)]),
    );
  return value;
}

/** Canonicalize manifest payloads, including nested Cubism dependencies.
 * Publish objects and aliases before changing manifests. Only remove verified
 * input files after all manifests have been committed. Original game files are
 * never touched. Re-running also accepts already migrated manifests.
 */
export function shareAssets(root, manifestPaths) {
  const indexPath = resolve(root, 'public/private/shared/index.json');
  const index = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : { version: 1, aliases: {}, objects: {} };
  const aliases = { ...index.aliases };
  const imageIndex = resolve(root, '.cache/storage-images/index.json');
  const images = existsSync(imageIndex)
    ? JSON.parse(readFileSync(imageIndex, 'utf8'))
    : {};
  const documents = manifestPaths
    .filter(existsSync)
    .map((path) => ({
      path,
      data: JSON.parse(readFileSync(path, 'utf8')),
    }))
    .filter(({ data }) => data && Array.isArray(data.files));
  const inputs = new Map();
  const checked = new Set();
  for (const { data } of documents)
    for (const file of data.files) {
      if (!file.url) throw Error('Manifest contains an asset without a URL');
      if (file.url.startsWith('/private/shared/')) {
        if (!/^\/private\/shared\/[a-f0-9]{64}\.[a-z0-9]+$/.test(file.url))
          throw Error('Invalid shared asset identity');
        if (checked.has(file.url)) continue;
        const object = index.objects[file.url];
        const bytes = readFileSync(publicFile(root, file.url));
        if (
          !object ||
          bytes.length !== file.bytes ||
          digest(bytes) !== file.sha256 ||
          object.sha256 !== file.sha256
        )
          throw Error(`Shared asset failed integrity check: ${file.url}`);
        checked.add(file.url);
        continue;
      }
      const path = publicFile(root, file.url);
      if (!existsSync(path)) {
        if (
          aliases[file.url] &&
          existsSync(publicFile(root, aliases[file.url]))
        )
          continue;
        throw Error(`Asset is missing: ${file.url}`);
      }
      const bytes = readFileSync(path);
      if (
        bytes.length !== file.bytes ||
        (file.sha256 && digest(bytes) !== file.sha256)
      )
        throw Error(`Asset failed integrity check: ${file.url}`);
      inputs.set(file.url, {
        path,
        sha256: digest(bytes),
        bytes: bytes.length,
        record: file,
      });
    }
  const put = (old, bytes, extensionOverride) => {
    const sha256 = digest(bytes);
    const extension = extensionOverride ?? extname(old).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(extension))
      throw Error(`Invalid extension: ${old}`);
    const url = `/private/shared/${sha256}${extension}`;
    const path = publicFile(root, url);
    if (existsSync(path)) {
      const actual = readFileSync(path);
      if (actual.length !== bytes.length || digest(actual) !== sha256)
        throw Error(`Shared asset is corrupt: ${url}`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, bytes);
      renameSync(`${path}.tmp`, path);
    }
    index.objects[url] = { url, bytes: bytes.length, sha256 };
    aliases[old] = url;
    return url;
  };
  const models = [];
  for (const [url, input] of inputs) {
    const bytes = readFileSync(input.path);
    if (url.endsWith('.json')) {
      const json = JSON.parse(bytes.toString('utf8'));
      if (json.FileReferences) {
        models.push([url, input, json]);
        continue;
      }
    }
    const image = images[input.sha256];
    if (url.endsWith('.png') && image?.output && image.sameRGBA) {
      const candidate = existsSync(image.output)
        ? image.output
        : publicFile(root, `/private/shared/${image.sha256}.webp`);
      const converted = readFileSync(candidate);
      if (
        digest(converted) !== image.sha256 ||
        converted.length !== image.bytes
      )
        throw Error(`Invalid lossless image candidate: ${url}`);
      put(url, converted, '.webp');
    } else put(url, bytes);
  }
  for (const [url, input, model] of models) {
    const local = (file) => {
      const target = decodeURIComponent(
        new URL(file, `http://localhost${url}`).pathname,
      );
      const mapped =
        aliases[target] ?? (index.objects[target] ? target : undefined);
      if (!mapped) throw Error(`Uninventoried model dependency: ${target}`);
      return mapped;
    };
    const visit = (object) => {
      for (const [key, value] of Object.entries(object)) {
        if (
          typeof value === 'string' &&
          (key === 'File' ||
            ['Moc', 'Physics', 'Pose', 'DisplayInfo', 'UserData'].includes(key))
        )
          object[key] = local(value);
        else if (key === 'Textures') object[key] = value.map(local);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(model.FileReferences);
    put(url, Buffer.from(JSON.stringify(model) + '\n'));
  }
  // Existing aliases may point at a payload subsequently losslessly converted.
  for (const old of Object.keys(aliases)) {
    const seen = new Set([old]);
    let target = aliases[old];
    while (aliases[target] && aliases[target] !== target) {
      if (seen.has(target)) throw Error('Cyclic asset alias');
      seen.add(target);
      target = aliases[target];
    }
    aliases[old] = target;
  }
  index.aliases = Object.fromEntries(Object.entries(aliases).sort());
  index.objects = Object.fromEntries(Object.entries(index.objects).sort());
  atomicJSON(indexPath, index);
  for (const { path, data } of documents) {
    const updated = rewrite(data, aliases);
    const files = new Map();
    for (let i = 0; i < data.files.length; i++) {
      const original = data.files[i];
      const url = aliases[original.url] ?? original.url;
      const object = index.objects[url];
      if (!object) throw Error(`No shared payload: ${url}`);
      const record = { ...updated.files[i], ...object };
      const sources = original.originalFiles ?? [
        { url: original.url, sha256: original.sha256, source: original.source },
      ];
      record.originalFiles = [
        ...(files.get(url)?.originalFiles ?? []),
        ...sources,
      ];
      record.originalFiles = [
        ...new Map(
          record.originalFiles.map((file) => [JSON.stringify(file), file]),
        ).values(),
      ];
      files.set(url, record);
    }
    updated.files = [...files.values()];
    if (updated.characters) {
      const urls = new Set();
      for (const actor of Object.values(updated.characters)) {
        if (actor.url) urls.add(actor.url);
        if (actor.female?.url) urls.add(actor.female.url);
      }
      updated.modelCount = urls.size;
    }
    atomicJSON(path, updated);
  }
  let retiredBytes = 0;
  for (const [url, input] of inputs) {
    if (aliases[url] === url) continue;
    // An input changed concurrently must never be removed.
    if (digest(readFileSync(input.path)) !== input.sha256)
      throw Error(`Asset changed during migration: ${url}`);
    retiredBytes += input.bytes;
    unlinkSync(input.path);
  }
  return {
    objects: Object.keys(index.objects).length,
    retiredBytes,
    aliases: index.aliases,
  };
}

export function shareGameAssets(root) {
  const additional = eventSpecs(root).flatMap((spec) =>
    ['media', 'characters', 'videos'].map(
      (kind) => `public/private/${spec.id}/${kind}/manifest.json`,
    ),
  );
  return shareAssets(
    root,
    [
      'public/private/gfl2-event/media/manifest.json',
      'public/private/gfl2-event/characters/manifest.json',
      'public/private/gfl2-ilion/media/manifest.json',
      'public/private/gfl2-ilion/characters/manifest.json',
      'public/private/gfl2-ilion/videos/manifest.json',
      'public/private/gfl2-effects/manifest.json',
      'src/generated/gfl2-effects.json',
      'public/private/gfl2-remaining-assets/media/manifest.json',
      'public/private/gfl2-remaining-assets/characters/manifest.json',
      'public/private/gfl2-remaining-assets/videos/manifest.json',
      ...additional,
    ].map((path) => resolve(root, path)),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = shareGameAssets(
    resolve(fileURLToPath(new URL('..', import.meta.url))),
  );
  console.log(
    `Shared library: ${result.objects} unique objects; retired ${result.retiredBytes} bytes of per-package files.`,
  );
}
