// Synchronize verified implicit emotion audio without rebuilding localized text.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';

export function syncBaRecipeAssets(
  recipe,
  assets,
  episode,
  selectors,
  sources,
) {
  recipe.assets = assets;
  recipe.episode = episode;
  const urls = new Set(recipe.outputs.map((output) => output.url));
  for (const file of assets.files) {
    if (urls.has(file.url)) continue;
    const selector = selectors.get(file.url);
    if (
      !selector ||
      selector.sha256 !== file.sha256 ||
      selector.bytes !== file.bytes
    )
      throw Error(`Missing verified BA output: ${file.url}`);
    const output = structuredClone(selector);
    // Prologue and full-library input IDs may differ. Reuse by exact source URL.
    for (const key of ['input', 'soundInput']) {
      if (output[key] === undefined) continue;
      const source = sources.find((input) => input.id === output[key]);
      if (!source) throw Error(`Missing original BA source: ${output[key]}`);
      let existing = recipe.inputs.find((input) => input.url === source.url);
      if (!existing) {
        const id = Math.max(-1, ...recipe.inputs.map((input) => input.id)) + 1;
        existing = { ...source, id };
        recipe.inputs.push(existing);
      }
      if (existing.sha256 !== source.sha256)
        throw Error(`BA source integrity collision: ${source.url}`);
      output[key] = existing.id;
    }
    recipe.outputs.push(output);
    urls.add(file.url);
  }
  return recipe;
}

export async function publishBaEmotionSounds(root = process.cwd()) {
  const read = (file) =>
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const write = async (file, value, pretty = false) => {
    const filename = path.join(root, file);
    const serialized = JSON.stringify(value, null, pretty ? 2 : undefined);
    fs.writeFileSync(
      filename,
      file.startsWith('src/downloads/ba/')
        ? await format(serialized, { parser: 'json' })
        : serialized + (pretty ? '\n' : ''),
    );
  };
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const episodes = read('src/generated/ba-stories.json');
  const registry = read('src/downloads/ba/catalog.json');
  const selectors = new Map(
    read('src/downloads/ba/outputs.json').map((output) => [output.url, output]),
  );
  const sources = read('src/downloads/ba/sources.json');
  let chapters = 0;
  for (const episode of episodes) {
    const group = Number(episode.id.replace('ba-jp-', ''));
    const prefix = `public/private/ba-jp/${group}`;
    const assets = read(`${prefix}/assets.json`);
    const program = read(`${prefix}/scenes.json`);
    const entry = registry.find((item) => item.id === episode.id);
    const recipePath = `src/downloads/ba/recipes/${entry.recipe}`;
    const recipeBytes = fs.readFileSync(path.join(root, recipePath));
    const recipe = JSON.parse(gunzipSync(recipeBytes));
    const outputUrls = new Set(recipe.outputs.map((output) => output.url));
    const missing = Object.keys(assets.sounds).filter(
      (name) =>
        name.startsWith('SFX_Emoticon_Motion_') &&
        (!program.assets.sounds[name] ||
          !recipe.assets.sounds[name] ||
          !outputUrls.has(assets.sounds[name])),
    );
    if (
      !missing.length &&
      entry.sha256 === sha(recipeBytes) &&
      recipe.episode.content.sceneUrl === episode.content.sceneUrl
    )
      continue;
    program.assets = assets;
    const serialized = JSON.stringify(program);
    const revision = sha(serialized).slice(0, 16);
    fs.writeFileSync(path.join(root, prefix, 'scenes.json'), serialized);
    const replaceRevision = (url) =>
      /\/(chapter|scenes)\.json(?:\?|$)/.test(url)
        ? url.replace(/(?:\?v=[^?]+)?$/, `?v=${revision}`)
        : url;
    episode.content.url = replaceRevision(episode.content.url);
    episode.content.sceneUrl = replaceRevision(episode.content.sceneUrl);
    episode.assets = [
      ...new Set([
        ...episode.assets.map(replaceRevision),
        ...assets.files.map((file) => file.url),
      ]),
    ];
    const provenance = read(`${prefix}/provenance.json`);
    if (provenance.assets) provenance.assets.files = assets.files.length;
    await write(`${prefix}/provenance.json`, provenance);
    syncBaRecipeAssets(recipe, assets, episode, selectors, sources);
    const compressed = gzipSync(JSON.stringify(recipe), { level: 9, mtime: 0 });
    fs.writeFileSync(path.join(root, recipePath), compressed);
    Object.assign(entry, {
      sha256: sha(compressed),
      bytes: compressed.length,
      downloadBytes: recipe.inputs.reduce((sum, input) => sum + input.bytes, 0),
      inputs: recipe.inputs.map((input) => input.id),
    });
    if (group === 11000) await write('src/downloads/ba/recipe.json', recipe);
    chapters++;
  }
  await write('src/generated/ba-stories.json', episodes, true);
  await write('src/downloads/ba/catalog.json', registry);
  console.log(
    `Published original emotion audio for ${chapters} BA chapters; localized text preserved.`,
  );
  return chapters;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await publishBaEmotionSounds();
