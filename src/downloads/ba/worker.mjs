// Process only the pinned original files supplied by the user or desktop downloader.
import {
  ZipReader,
  BlobReader,
  Uint8ArrayWriter,
  configure,
} from '@zip.js/zip.js';
import { load } from 'unity-asset-reader';
import { decodeImage, initTexture } from 'unity-asset-reader-texture';
import { zlibSync } from 'fflate';
import { compileStory } from '../../../scripts/ba-story.mjs';
import { localizeBaChapter } from '../../../scripts/ba-localization.mjs';
import { compileBaScenes } from '../../../scripts/ba-scenes.mjs';
import { canonicalBaScript } from '../../playback/ba/script.ts';
import setupsBase64 from './vorbis/setups.json';
import { fsbAudio } from './fsb-audio.mjs';
import { exportDatabaseChapter } from './database.mjs';
import { cachedDatabaseChapter } from './source-cache.mjs';
import { reusableOutput, recordOutput } from './output-cache.mjs';

configure({ useWebWorkers: false });
const sha = async (b) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
    .map((a) => a.toString(16).padStart(2, '0'))
    .join('');
const utf8 = (s) => new TextEncoder().encode(s);
const report = (message, done, total) =>
  postMessage({ type: 'progress', message, done, total });
function png(rgba, width, height) {
  const chunk = (name, body) => {
    const result = new Uint8Array(body.length + 12),
      view = new DataView(result.buffer);
    view.setUint32(0, body.length);
    result.set(utf8(name), 4);
    result.set(body, 8);
    let crc = 0xffffffff;
    for (const byte of result.subarray(4, -4)) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
    return result;
  };
  const ihdr = new Uint8Array(13),
    v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(rows, { level: 6 })),
    chunk('IEND', new Uint8Array()),
  ];
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
const conversions = new Map();
async function nativeConvert(output, inputs) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    conversions.set(id, { resolve, reject });
    postMessage(
      {
        type: 'convert',
        id,
        output: output.url,
        kind: output.kind === 'audio' ? 'concat-audio' : output.kind,
        inputs: inputs.map((bytes, i) => ({
          bytes,
          name: `input-${i}${output.kind === 'video' && i === 0 ? '.mp4' : '.ogg'}`,
        })),
      },
      inputs.map((bytes) => bytes.buffer),
    );
  });
}
export async function run({ recipe, files, stagingCacheName }) {
  if (![1, 2].includes(recipe.version) || !Number.isSafeInteger(recipe.group))
    throw Error('Unsupported BA import recipe');
  const started = performance.now(),
    originals = new Map();
  const cachedSource = recipe.source
    ? await cachedDatabaseChapter(recipe.group, recipe.source)
    : null;
  const cachedEnglish = recipe.localization
    ? await cachedDatabaseChapter(recipe.group, recipe.localization)
    : null;
  const reused = new Map();
  for (const output of recipe.outputs) {
    const cached = await reusableOutput(recipe, output);
    if (cached) reused.set(output.url, cached);
  }
  const needed = new Set(
    recipe.source
      ? cachedSource
        ? []
        : [recipe.source.input]
      : [recipe.story, recipe.characters],
  );
  const pendingOutputs = recipe.outputs.filter((o) => !reused.has(o.url));
  if (recipe.localization && !cachedEnglish)
    needed.add(recipe.localization.input);
  for (const output of pendingOutputs) {
    if (output.input != null) needed.add(output.input);
    if (output.soundInput != null) needed.add(output.soundInput);
    for (const part of output.parts ?? []) needed.add(part.input);
  }
  for (const a of recipe.inputs.filter((i) => needed.has(i.id))) {
    const file = files.find((f) => f.name === a.filename && f.size === a.bytes);
    if (!file)
      throw Error(`Select the original file ${a.filename} (${a.bytes} bytes)`);
    if ((await sha(await file.arrayBuffer())) !== a.sha256)
      throw Error(`Original checksum mismatch: ${a.filename}`);
    originals.set(a.id, file);
    report(`Checking original files`, originals.size, recipe.inputs.length);
  }
  const cacheName = stagingCacheName ?? 'onlystory.ba-staging.v1';
  await caches.delete(cacheName);
  const staged = await caches.open(cacheName),
    produced = [],
    audio = [];
  for (const { response, file } of reused.values()) {
    await staged.put(file.url, response);
    produced.push(file);
  }
  async function originalBytes(part) {
    const blob = originals.get(part.input);
    if (!blob) throw Error(`Missing original input ${part.input}`);
    if (!part.member) return new Uint8Array(await blob.arrayBuffer());
    const zip = new ZipReader(new BlobReader(blob));
    try {
      const entry = (await zip.getEntries()).find(
        (e) => e.filename === part.member,
      );
      if (!entry) throw Error(`Missing original ZIP member ${part.member}`);
      return await entry.getData(new Uint8ArrayWriter(), {
        password:
          part.password ??
          recipe.inputs.find((i) => i.id === part.input)?.password,
      });
    } finally {
      await zip.close();
    }
  }
  async function put(output, bytes, type) {
    const hash = await sha(bytes);
    if (
      ['copy', 'text', 'license'].includes(output.kind) &&
      hash !== output.sha256
    )
      throw Error(`Output checksum mismatch: ${output.url}`);
    await staged.put(
      output.url,
      new Response(bytes, { headers: { 'Content-Type': type } }),
    );
    produced.push({ url: output.url, bytes: bytes.byteLength, sha256: hash });
    report('Importing story media', produced.length, recipe.outputs.length);
  }
  for (const output of pendingOutputs) {
    if (
      output.kind === 'video' ||
      output.kind === 'concat-audio' ||
      output.kind === 'audio'
    )
      await put(
        output,
        await nativeConvert(
          output,
          await Promise.all(
            (
              output.parts ?? [
                { input: output.input },
                ...(output.soundInput == null
                  ? []
                  : [{ input: output.soundInput }]),
              ]
            ).map(originalBytes),
          ),
        ),
        output.kind === 'video' ? 'video/mp4' : 'audio/ogg',
      );
    if (output.kind === 'copy' && !output.member)
      await put(
        output,
        await originals.get(output.input).arrayBuffer(),
        /\.ogg$/.test(output.url)
          ? 'audio/ogg'
          : /\.png$/.test(output.url)
            ? 'image/png'
            : 'image/jpeg',
      );
    if (output.kind === 'license')
      await put(output, utf8(recipe.licenseText), 'text/plain');
  }
  const setups = Object.fromEntries(
    Object.entries(setupsBase64).map(([id, base64]) => [
      id,
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    ]),
  );
  await initTexture({
    wasmPath: new URL('/vendor/texture2ddecoder', self.location.href).href,
  });
  for (const input of recipe.inputs.filter((a) =>
    pendingOutputs.some((o) => o.input === a.id && o.member),
  )) {
    const zip = new ZipReader(new BlobReader(originals.get(input.id)));
    try {
      const entries = await zip.getEntries();
      const members = [
        ...new Set(
          pendingOutputs
            .filter((a) => a.input === input.id && a.member)
            .map((a) => a.member),
        ),
      ];
      for (const member of members) {
        const entry = entries.find((a) => a.filename === member);
        if (!entry) throw Error(`Missing Unity bundle ${member}`);
        const targets = pendingOutputs.filter(
          (a) => a.input === input.id && a.member === member,
        );
        const payload = await entry.getData(new Uint8ArrayWriter(), {
          password: targets.find((o) => o.password)?.password ?? input.password,
        });
        if (targets.every((o) => o.kind === 'copy')) {
          for (const output of targets)
            await put(output, payload, output.mime ?? 'audio/ogg');
          continue;
        }
        const env = load(payload);
        const decoded = new Map();
        for (const output of targets) {
          const type =
            output.kind === 'text'
              ? 'TextAsset'
              : output.kind === 'vorbis'
                ? 'AudioClip'
                : 'Texture2D';
          const asset = [...env.assets(type)].find((a) =>
            output.pathId
              ? String(a.pathId) === String(output.pathId)
              : a.name === output.name,
          );
          if (!asset) throw Error(`Missing ${type} ${output.name}`);
          if (output.kind === 'text')
            await put(output, asset.data.bytes, 'application/octet-stream');
          else if (output.kind === 'vorbis') {
            const converted = fsbAudio(asset.data.audioData, setups);
            audio.push({
              url: output.url,
              frames: converted.frames,
              channels: converted.channels,
              frequency: converted.frequency,
              setupId: converted.setupId,
            });
            await put(output, converted.bytes, converted.mime);
          } else {
            if (!decoded.has(output.name))
              decoded.set(output.name, await decodeImage(asset));
            const image = decoded.get(output.name);
            let rgba = image.rgba,
              width = image.width,
              height = image.height;
            if (output.crop) {
              const c = output.crop;
              width = c.width;
              height = c.height;
              rgba = new Uint8Array(width * height * 4);
              for (let y = 0; y < height; y++)
                rgba.set(
                  image.rgba.subarray(
                    ((c.y + y) * image.width + c.x) * 4,
                    ((c.y + y) * image.width + c.x + width) * 4,
                  ),
                  y * width * 4,
                );
            }
            if (
              width !== output.width ||
              height !== output.height ||
              (await sha(rgba)) !== output.rgbaSha256
            )
              throw Error(`Decoded pixels differ: ${output.url}`);
            await put(output, png(rgba, width, height), 'image/png');
          }
        }
      }
    } finally {
      await zip.close();
    }
  }
  if (produced.length !== recipe.outputs.length)
    throw Error('Incomplete chapter');
  const { source, names } = recipe.source
    ? await exportDatabaseChapter(
        cachedSource
          ? null
          : new Uint8Array(
              await originals.get(recipe.source.input).arrayBuffer(),
            ),
        recipe.source,
        recipe.group,
        (done, total) =>
          report('Decoding original story database', done, total),
      )
    : {
        source: JSON.parse(await originals.get(recipe.story).text()),
        names: JSON.parse(await originals.get(recipe.characters).text()),
      };
  const chapter = compileStory(source, names),
    assets = structuredClone(recipe.assets);
  if (recipe.localization) {
    const english =
      cachedEnglish ??
      (await exportDatabaseChapter(
        new Uint8Array(
          await originals.get(recipe.localization.input).arrayBuffer(),
        ),
        recipe.localization,
        recipe.group,
        (done, total) =>
          report('Decoding original English story database', done, total),
      ));
    localizeBaChapter(chapter, source, english.source, english.names);
  }
  assets.files = produced;
  const program = compileBaScenes(source, chapter, assets);
  // Match the maintainer importer's shared-reader annotations.
  for (const node of chapter.nodes) {
    const row = source.content[node.source?.row];
    if (row?.VoiceJp) node.voice = assets.voices[row.VoiceJp];
    if (node.kind === 'video') {
      const video = /(?:^|\n)#(?:video|videons2);([^\n;]+)/.exec(
        canonicalBaScript(row?.ScriptKr ?? ''),
      )?.[1];
      node.video = assets.videos?.[video];
      if (!node.video) throw Error(`Missing movie for ${node.id}: ${video}`);
    }
    if (
      row &&
      /#(?:st[mr]?|place|title|continued|Ending|nextepisode)(?:;|$)/.test(
        canonicalBaScript(row.ScriptKr),
      )
    )
      node.scene.window = 'system';
    const font = row && /#fontsize;(\d+)/.exec(row.ScriptKr);
    if (font) node.scene.fontScale = Number(font[1]) / 80;
  }
  const prefix = `/private/ba-jp/${recipe.group}`;
  const metadata = [
    [recipe.episode.content.url, chapter],
    [recipe.episode.content.sceneUrl, program],
    [prefix + '/assets.json', assets],
    [prefix + '/source.json', source],
    [prefix + '/characters.json', names],
    [
      prefix + '/provenance.json',
      {
        importer: `ba-originals-v${recipe.version}`,
        inputs: recipe.inputs,
        importedAt: new Date().toISOString(),
      },
    ],
  ];
  for (const [url, value] of metadata)
    await staged.put(
      url,
      new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  // Publish only after every pinned input and derived output succeeded.
  const media = await caches.open('onlystory.media.v1');
  for (const request of await staged.keys())
    await media.put(request, await staged.match(request));
  for (const output of pendingOutputs)
    await recordOutput(
      recipe,
      output,
      produced.find((file) => file.url === output.url),
    );
  const installationFiles = (await staged.keys()).map(
    (r) => new URL(r.url).pathname + new URL(r.url).search,
  );
  await caches.delete(cacheName);
  return {
    elapsedMs: performance.now() - started,
    inputs: originals.size,
    outputs: produced.length,
    sourceRows: source.content.length,
    chapterNodes: chapter.nodes.length,
    choices: chapter.coverage.choices,
    steps: program.steps.length,
    models: Object.keys(assets.characters).length,
    audio,
    files: produced,
    installationFiles,
    coverage: chapter.coverage,
    warnings: program.warnings,
  };
}
self.onmessage = async ({ data }) => {
  if (data.type === 'converted') {
    const pending = conversions.get(data.id);
    if (pending) {
      conversions.delete(data.id);
      if (data.error) pending.reject(Error(data.error));
      else pending.resolve(data.bytes);
    }
    return;
  }
  try {
    postMessage({ type: 'complete', result: await run(data) });
  } catch (error) {
    postMessage({ type: 'error', message: error.message || String(error) });
  }
};
