// Maintainer-only recipe preparation. The browser receives selectors and hashes,
// never pre-extracted game-media bodies.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function prepare(root) {
  const work = path.join(root, '.cache/ba-browser-import');
  const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = await import(
    pathToFileURL(path.join(work, 'node_modules/@zip.js/zip.js/index.js'))
  );
  const { load } = await import(
    pathToFileURL(
      path.join(work, 'node_modules/unity-asset-reader/dist/index.mjs'),
    )
  );
  const { decodeImage } = await import(
    pathToFileURL(
      path.join(work, 'node_modules/unity-asset-reader-texture/dist/index.mjs'),
    )
  );
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const assets = read('public/private/ba-jp/11000/assets.json');
  const provenance = read('public/private/ba-jp/11000/provenance.json');
  const episode = read('src/generated/ba-stories.json').find(
    (a) => a.id === 'ba-jp-11000',
  );
  const inputs = [],
    localPaths = [],
    outputs = new Map();
  function input(a, local) {
    const bytes = fs.readFileSync(local);
    if (bytes.length !== a.bytes || sha(bytes) !== a.sha256)
      throw Error(`Original input mismatch: ${local}`);
    const id = inputs.length;
    inputs.push({ ...a, id, filename: path.basename(local) });
    localPaths.push(path.resolve(local));
    return id;
  }
  for (const a of assets.inputs)
    input(
      a,
      path.join(
        root,
        '.cache/ba-jp-assets/jp/android/raw',
        a.path.startsWith('Bundle/') ? 'bundles' : 'media',
        a.path.split('/').slice(1).join('/'),
      ),
    );
  for (const a of assets.referenceEffectArt)
    input(
      a,
      path.join(
        root,
        '.cache/ba-underfire-reference',
        new URL(a.url).pathname.split('/').at(-1),
      ),
    );
  const revision = provenance.revision;
  const story = input(
    provenance.inputs.find((a) => a.key === 'story'),
    path.join(root, '.cache/ba-source', revision, 'story.json'),
  );
  const characters = input(
    provenance.inputs.find((a) => a.key === 'characters'),
    path.join(root, '.cache/ba-source', revision, 'characters.json'),
  );
  const direct = new Map(inputs.map((a) => [a.sha256, a.id]));
  for (const f of assets.files) {
    if (direct.has(f.sha256))
      outputs.set(f.url, { ...f, kind: 'copy', input: direct.get(f.sha256) });
    else if (f.url.endsWith('/Spine-LICENSE.txt'))
      outputs.set(f.url, { ...f, kind: 'license' });
  }
  const python = path.join(
    root,
    '.cache/ba-downloader/.venv/Scripts/python.exe',
  );
  const pixels = JSON.parse(
    execFileSync(
      python,
      [
        '-X',
        'utf8',
        '-c',
        'import json,hashlib;from pathlib import Path;from PIL import Image;a=json.loads(Path("public/private/ba-jp/11000/assets.json").read_text());out=Path(".cache/ba-browser-import/goldens");out.mkdir(exist_ok=True);result={}\nfor f in a["files"]:\n if f["url"].endswith(".png"):\n  im=Image.open("public"+f["url"]).convert("RGBA");raw=im.tobytes();digest=hashlib.sha256(raw).hexdigest();(out/(digest+".rgba")).write_bytes(raw);result[f["url"]]={"width":im.width,"height":im.height,"rgbaSha256":digest}\nprint(json.dumps(result))',
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  function comparePixels(rgba, expected) {
    const native = fs.readFileSync(
      path.join(work, 'goldens', expected.rgbaSha256 + '.rgba'),
    );
    if (native.length !== rgba.length) throw Error('Texture dimensions differ');
    let maxChannelError = 0,
      differingChannels = 0;
    for (let i = 0; i < native.length; i++) {
      const error = Math.abs(native[i] - rgba[i]);
      maxChannelError = Math.max(maxChannelError, error);
      if (error) differingChannels++;
    }
    return {
      ...expected,
      nativeRgbaSha256: expected.rgbaSha256,
      rgbaSha256: sha(rgba),
      maxChannelError,
      differingChannels,
    };
  }
  const textures = new Map(
    assets.files
      .filter(
        (f) =>
          f.url.endsWith('.png') &&
          !outputs.has(f.url) &&
          !f.url.includes('/emotion/'),
      )
      .map((f) => [path.basename(f.url, '.png'), f]),
  );
  const sounds = new Map(
    Object.entries(assets.sounds).map(([name, url]) => [
      name.toLowerCase(),
      assets.files.find((f) => f.url === url),
    ]),
  );
  const texts = new Map(
    assets.files
      .filter((f) => /\.(?:atlas|skel)$/.test(f.url))
      .map((f) => [f.sha256, f]),
  );
  for (const p of inputs.filter((a) => a.path?.startsWith('Bundle/'))) {
    const zip = new ZipReader(
      new Uint8ArrayReader(fs.readFileSync(localPaths[p.id])),
    );
    try {
      for (const e of await zip.getEntries()) {
        if (
          !/spinecharacters-(?:rin_spr|suzumi_spr|yuuka_spr|chinatsu_spr|momoka_spr|hasumi_spr)-|audio-_mxprolog|audio-sfx_|uis-atlas-_mxprolog-2025|effectsfreezed-texture-_mxprolog-2025/.test(
            e.filename,
          )
        )
          continue;
        const env = load(await e.getData(new Uint8ArrayWriter()));
        for (const a of env.assets('TextAsset', 'Texture2D', 'AudioClip')) {
          const base = { input: p.id, member: e.filename, name: a.name };
          if (a.type === 'TextAsset') {
            const f = texts.get(sha(a.data.bytes));
            if (f) outputs.set(f.url, { ...f, ...base, kind: 'text' });
          } else if (a.type === 'AudioClip') {
            const f = sounds.get(a.name.toLowerCase());
            if (f && !outputs.has(f.url))
              outputs.set(f.url, { ...f, ...base, kind: 'vorbis' });
          } else if (textures.has(a.name)) {
            const f = textures.get(a.name),
              expected = pixels[f.url];
            const decoded = await decodeImage(a);
            const comparison = comparePixels(decoded.rgba, expected);
            if (comparison.maxChannelError <= 1)
              outputs.set(f.url, {
                ...f,
                ...base,
                ...comparison,
                kind: 'texture',
              });
          } else if (a.name === 'Emoji') {
            const atlas = [...env.assets('MonoBehaviour')].find(
              (a) => a.name === 'Emoji',
            );
            const image = await decodeImage(a);
            for (const s of atlas.data.fields.mSprites) {
              const url = assets.emotions[s.name],
                f = assets.files.find((f) => f.url === url);
              if (!f) continue;
              const rgba = new Uint8Array(s.width * s.height * 4);
              for (let y = 0; y < s.height; y++)
                rgba.set(
                  image.rgba.subarray(
                    ((s.y + y) * image.width + s.x) * 4,
                    ((s.y + y) * image.width + s.x + s.width) * 4,
                  ),
                  y * s.width * 4,
                );
              const comparison = comparePixels(rgba, pixels[url]);
              if (comparison.maxChannelError > 1)
                throw Error(`Emoji pixels differ: ${s.name}`);
              outputs.set(url, {
                ...f,
                ...base,
                ...comparison,
                kind: 'texture',
                crop: { x: s.x, y: s.y, width: s.width, height: s.height },
              });
            }
          }
        }
      }
    } finally {
      await zip.close();
    }
  }
  const missing = assets.files.filter((f) => !outputs.has(f.url));
  if (missing.length)
    throw Error(
      `Unresolved original extraction: ${JSON.stringify(missing.map((f) => f.url))}`,
    );
  const recipe = {
    version: 1,
    group: 11000,
    inputs,
    outputs: [...outputs.values()],
    assets,
    episode,
    story,
    characters,
    licenseText: fs.readFileSync(
      path.join(root, 'public/vendor/spine/LICENSE'),
      'utf8',
    ),
  };
  fs.writeFileSync(path.join(work, 'recipe.json'), JSON.stringify(recipe));
  fs.writeFileSync(
    path.join(work, 'input-paths.json'),
    JSON.stringify(localPaths),
  );
  console.log(
    `Prepared ${inputs.length} original files, ${outputs.size} outputs, ${inputs.reduce((n, a) => n + a.bytes, 0)} input bytes`,
  );
  return { recipe, localPaths, work };
}
