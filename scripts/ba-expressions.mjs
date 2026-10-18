import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
} from '@esotericsoftware/spine-webgl';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const metadata = new Map();
export async function enrichBaExpressions(assets, options = {}) {
  const file = (url) =>
    options.mediaRoot && url.startsWith(options.urlPrefix)
      ? path.join(options.mediaRoot, url.slice(options.urlPrefix.length))
      : path.join(publicRoot, url);
  for (const asset of Object.values(assets.characters)) {
    if (asset.invisible) {
      asset.expressionNames = [];
      continue;
    }
    const key = file(asset.skeleton);
    if (!metadata.has(key)) {
      const atlas = new TextureAtlas(
        await fs.readFile(file(asset.atlas), 'utf8'),
      );
      const skeleton = new SkeletonBinary(
        new AtlasAttachmentLoader(atlas),
      ).readSkeletonData(await fs.readFile(key));
      metadata.set(key, {
        animations: skeleton.animations.map((animation) => animation.name),
        skins: skeleton.skins.map((skin) => skin.name),
      });
    }
    const info = metadata.get(key);
    asset.expressionNames = info.animations;
    if (asset.skin && !info.skins.includes(asset.skin))
      throw new Error(
        `Original skin unavailable: ${asset.model} ${asset.skin}`,
      );
  }
  return assets;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const assets = JSON.parse(input);
  const option = (name) =>
    process.argv
      .find((arg) => arg.startsWith(name + '='))
      ?.slice(name.length + 1);
  await enrichBaExpressions(assets, {
    mediaRoot: option('--media-root'),
    urlPrefix: option('--url-prefix'),
  });
  process.stdout.write(JSON.stringify(assets));
}
