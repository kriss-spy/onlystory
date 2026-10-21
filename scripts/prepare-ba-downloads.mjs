// Verify browser extraction against prepared native outputs, then publish only
// selectors, hashes, catalog metadata and compiler inputs (never story/media).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, inflateSync } from 'node:zlib';
import { load } from 'unity-asset-reader';
import { format } from 'prettier';
import { syncBaRecipeAssets } from './publish-ba-emotion-sounds.mjs';
import { decodeImage } from 'unity-asset-reader-texture';
import {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  configure,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });

const root = process.cwd();
const work = path.join(root, '.cache/ba-all-downloads');
const target = path.join(root, 'src/downloads/ba');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const save = async (p, value) =>
  fs.writeFileSync(
    p,
    p.startsWith(target)
      ? await format(JSON.stringify(value), { parser: 'json' })
      : JSON.stringify(value),
  );
const selectors = read(path.join(work, 'selectors.json'));
const inputs = read(path.join(work, 'sources.json'));
const inputPaths = read(path.join(work, 'input-paths.json'));
const bootstrap = read(path.join(work, 'bootstrap.json'));
const englishProvenance = fs.existsSync(
  path.join(root, '.cache/ba-gl-source/provenance.json'),
)
  ? read(path.join(root, '.cache/ba-gl-source/provenance.json'))
  : null;
let englishInput;
if (englishProvenance) {
  englishInput = inputs.find(
    (input) => input.url === englishProvenance.source.url,
  );
  if (!englishInput) {
    englishInput = {
      ...englishProvenance.source,
      id: inputs.length,
      filename: 'ExcelDB.global.db',
    };
    inputs.push(englishInput);
  }
  inputPaths[englishInput.id] = path.join(root, englishProvenance.originalPath);
  await save(path.join(work, 'input-paths.json'), inputPaths);
}
const partGroups = new Map();
for (const output of selectors)
  for (const part of output.parts ?? []) {
    const parts = partGroups.get(part.input) ?? [];
    partGroups.set(part.input, parts);
    parts.push(part);
  }
for (const [id, parts] of partGroups) {
  const body = fs.readFileSync(inputPaths[id]);
  if (!parts.some((p) => p.member)) {
    for (const p of parts)
      Object.assign(p, { sha256: sha(body), bytes: body.length });
    continue;
  }
  const zip = new ZipReader(new Uint8ArrayReader(body));
  try {
    const entries = await zip.getEntries();
    for (const p of parts) {
      const entry = entries.find((e) => e.filename === p.member);
      if (!entry) throw Error(`Missing original audio member ${p.member}`);
      const bytes = await entry.getData(new Uint8ArrayWriter(), {
        password: p.password,
      });
      Object.assign(p, { sha256: sha(bytes), bytes: bytes.length });
    }
  } finally {
    await zip.close();
  }
}

function pngPixels(data) {
  const pieces = [];
  let width, height, type;
  for (let at = 8; at < data.length;) {
    const n = data.readUInt32BE(at),
      name = data.toString('ascii', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + n);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12])
        throw Error('Expected 8-bit noninterlaced golden');
      type = body[9];
    }
    if (name === 'IDAT') pieces.push(body);
    at += n + 12;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!channels) throw Error('Unsupported golden PNG format');
  const bytes = inflateSync(Buffer.concat(pieces)),
    stride = width * channels;
  const decoded = new Uint8Array(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? decoded[y * stride + x - channels] : 0,
        b = y ? decoded[(y - 1) * stride + x] : 0,
        c = y && x >= channels ? decoded[(y - 1) * stride + x - channels] : 0;
      const filter = bytes[y * (stride + 1)];
      decoded[y * stride + x] =
        bytes[y * (stride + 1) + x + 1] +
        (filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? (a + b) >> 1
                : paeth(a, b, c));
    }
  if (type === 6) return { width, height, rgba: decoded };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const at = i * channels;
    rgba.set(
      type === 6
        ? decoded.subarray(at, at + 4)
        : type === 2
          ? [...decoded.subarray(at, at + 3), 255]
          : type === 0
            ? [decoded[at], decoded[at], decoded[at], 255]
            : [decoded[at], decoded[at], decoded[at], decoded[at + 1]],
      i * 4,
    );
  }
  return { width, height, rgba };
}

const verifiedPath = path.join(work, 'verified-selectors.json');
const previous = fs.existsSync(verifiedPath) ? read(verifiedPath) : [];
const verified = new Map(previous.map((o) => [o.url, o]));
const groups = new Map();
for (const o of selectors) {
  if (o.kind !== 'texture' || o.rgbaSha256 || verified.has(o.url)) continue;
  const members = groups.get(o.input) ?? new Map();
  groups.set(o.input, members);
  const outputs = members.get(o.member) ?? [];
  members.set(o.member, outputs);
  outputs.push(o);
}
for (const [input, members] of groups) {
  const zip = new ZipReader(
    new Uint8ArrayReader(fs.readFileSync(inputPaths[input])),
  );
  try {
    const entries = await zip.getEntries();
    for (const [member, outputs] of members) {
      const entry = entries.find((e) => e.filename === member);
      const env = load(await entry.getData(new Uint8ArrayWriter()));
      const images = new Map();
      for (const o of outputs) {
        if (!images.has(o.name)) {
          const asset = [...env.assets('Texture2D')].find(
            (a) => a.name === o.name,
          );
          if (!asset)
            throw Error(`Missing browser Texture2D ${o.name} in ${member}`);
          images.set(o.name, await decodeImage(asset));
        }
        const image = images.get(o.name);
        const native = pngPixels(
          fs.readFileSync(path.join(root, 'public', o.url)),
        );
        if (image.width !== native.width || image.height !== native.height)
          throw Error(`Dimensions differ: ${o.url}`);
        let maxChannelError = 0,
          differingChannels = 0;
        for (let i = 0; i < image.rgba.length; i++) {
          const error = Math.abs(image.rgba[i] - native.rgba[i]);
          maxChannelError = Math.max(maxChannelError, error);
          if (error) differingChannels++;
        }
        if (maxChannelError > 1)
          throw Error(`Browser pixels differ by ${maxChannelError}: ${o.url}`);
        verified.set(o.url, {
          ...o,
          rgbaSha256: sha(image.rgba),
          maxChannelError,
          differingChannels,
        });
      }
    }
  } finally {
    await zip.close();
  }
  await save(verifiedPath, [...verified.values()]);
  console.log(
    `Verified ${verified.size} browser texture selectors: ${inputs[input].path}`,
  );
}
const outputs = selectors.map((o) => verified.get(o.url) ?? o);
const byUrl = new Map(outputs.map((o) => [o.url, o]));
const recipesDir = path.join(target, 'recipes');
fs.mkdirSync(recipesDir, { recursive: true });
const episodes = read(path.join(root, 'src/generated/ba-stories.json'));
const prologue = read(path.join(target, 'recipe.json'));
const catalog = [];
for (const episode of episodes) {
  const group = Number(episode.id.replace('ba-jp-', ''));
  const assets = read(
    path.join(root, `public/private/ba-jp/${group}/assets.json`),
  );
  let recipe;
  if (group === 11000)
    recipe = {
      ...prologue,
      episode,
      inputs: prologue.inputs.filter((input) => input.id !== englishInput?.id),
    };
  else {
    const chapterOutputs = assets.files.map((f) => byUrl.get(f.url));
    if (chapterOutputs.some((o) => !o))
      throw Error(`Missing selector: ${group}`);
    const ids = new Set([bootstrap.db]);
    for (const o of chapterOutputs) {
      if (o.input !== undefined) ids.add(o.input);
      if (o.soundInput !== undefined) ids.add(o.soundInput);
      for (const p of o.parts ?? []) ids.add(p.input);
    }
    const source = read(
      path.join(root, `public/private/ba-jp/${group}/source.json`),
    );
    const voiceNames = {};
    for (const row of source.content)
      if (row.VoiceId && row.VoiceJp) voiceNames[row.VoiceId] = row.VoiceJp;
    recipe = {
      version: 2,
      group,
      inputs: [...ids].sort((a, b) => a - b).map((id) => inputs[id]),
      outputs: chapterOutputs,
      episode,
      assets,
      source: {
        input: bootstrap.db,
        key: fs.readFileSync(path.join(work, 'key.txt'), 'utf8').trim(),
        voiceNames,
      },
      licenseText: prologue.licenseText,
    };
  }
  if (episode.textLocales.includes('en')) {
    if (!englishInput)
      throw Error(`Missing pinned English originals for ${group}`);
    recipe.inputs.push(englishInput);
    recipe.localization = {
      input: englishInput.id,
      schema: 'gl-1.93',
      key: fs
        .readFileSync(path.join(root, '.cache/ba-gl-source/key.txt'), 'utf8')
        .trim(),
    };
  } else delete recipe.localization;
  if (group === 11000) {
    syncBaRecipeAssets(recipe, assets, episode, byUrl, inputs);
    await save(path.join(target, 'recipe.json'), recipe);
  }
  const bytes = gzipSync(JSON.stringify(recipe), { level: 9, mtime: 0 });
  fs.writeFileSync(path.join(recipesDir, `ba-${group}.json.gz`), bytes);
  catalog.push({
    id: episode.id,
    group,
    recipe: `ba-${group}.json.gz`,
    sha256: sha(bytes),
    bytes: bytes.length,
    downloadBytes: recipe.inputs.reduce((n, i) => n + i.bytes, 0),
    inputs: recipe.inputs.map((i) => i.id),
  });
}
await save(path.join(target, 'sources.json'), inputs);
await save(path.join(target, 'outputs.json'), outputs);
await save(
  path.join(target, 'native-transforms.json'),
  outputs
    .filter((o) => ['audio', 'video'].includes(o.kind))
    .map((o) => ({
      id: o.url,
      kind: o.kind === 'audio' ? 'concat-audio' : 'video',
      inputs:
        o.kind === 'audio'
          ? o.parts.map((p) => ({ sha256: p.sha256, bytes: p.bytes }))
          : [o.input, o.soundInput]
              .filter((i) => i !== undefined)
              .map((i) => ({
                sha256: inputs[i].sha256,
                bytes: inputs[i].bytes,
              })),
    })),
);
await save(path.join(target, 'catalog.json'), catalog);
console.log(
  `Published ${catalog.length} BA chapter recipes, ${inputs.length} pinned originals, ${outputs.length} unique output selectors`,
);
