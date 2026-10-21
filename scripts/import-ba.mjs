import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileStory } from './ba-story.mjs';
import { localizeBaChapter } from './ba-localization.mjs';
import { compileBaScenes } from './ba-scenes.mjs';
import { enrichBaExpressions } from './ba-expressions.mjs';
import { canonicalBaScript } from '../src/playback/ba/script.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const revision = '4ddc9ee241f6028d724346acda190155dc98aaf6';
const base = `https://raw.githubusercontent.com/ba-archive/blue-archive/${revision}/`;
const definitions = JSON.parse(
  await fs.readFile(new URL('./ba-library.json', import.meta.url), 'utf8'),
);
const groupArg = process.argv.find((a) => a.startsWith('--groups='));
const selected = groupArg
  ? new Set(groupArg.slice(9).split(',').map(Number))
  : null;
const chapters = definitions.filter((d) => !selected || selected.has(d.group));
if (!chapters.length || (selected && chapters.length !== selected.size))
  throw new Error('Unknown BA group selection');
const prepareOnly = process.argv.includes('--prepare');
const imported = [];
let english = null,
  englishNames = null,
  englishProvenance = null,
  englishReleased = new Set(),
  titleLocales = {};
try {
  english = JSON.parse(
    await fs.readFile(
      path.join(root, '.cache/ba-gl-source/scripts.json'),
      'utf8',
    ),
  );
  englishNames = {
    DataList: JSON.parse(
      await fs.readFile(
        path.join(root, '.cache/ba-gl-source/ScenarioCharacterNameExcel.json'),
        'utf8',
      ),
    ),
  };
  englishProvenance = JSON.parse(
    await fs.readFile(
      path.join(root, '.cache/ba-gl-source/provenance.json'),
      'utf8',
    ),
  );
  englishReleased = new Set(
    JSON.parse(
      await fs.readFile(
        path.join(root, '.cache/ba-gl-source/availability.json'),
        'utf8',
      ),
    ).groups,
  );
  titleLocales = JSON.parse(
    await fs.readFile(path.join(root, 'src/ba-localized-titles.json'), 'utf8'),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const definition of chapters) {
  const inputs = {
    story: definition.sourcePath,
    characters:
      'apps/blue-archive-story-editor/src/assets/excel/ScenarioCharacterNameExcelTable.json',
  };
  const cache = path.join(root, '.cache/ba-source', revision);
  await fs.mkdir(cache, { recursive: true });
  const sources = {};
  const provenance = {
    repository: definition.sourceFile
      ? null
      : 'https://github.com/ba-archive/blue-archive',
    revision: definition.sourceFile ? null : revision,
    retrievedAt: new Date().toISOString(),
    region: 'JP',
    language: 'ja',
    inputs: [],
    presentation: 'text-only',
    translation: definition.sourceFile
      ? 'Japanese text from the acquired JP scenario database; extraction provenance is recorded in gameSource.'
      : 'Japanese text as preserved by BA Archive. This snapshot does not establish latest JP coverage.',
  };
  if (definition.provenanceFile)
    provenance.gameSource = JSON.parse(
      await fs.readFile(path.resolve(root, definition.provenanceFile), 'utf8'),
    );
  for (const [key, sourcePath] of Object.entries(inputs)) {
    const local =
      key === 'story' ? definition.sourceFile : definition.charactersFile;
    const url = local ? `local:${local}` : base + sourcePath;
    const cached = local
      ? path.resolve(root, local)
      : path.join(
          cache,
          key === 'story' && definition.group !== 11000
            ? `story-${definition.group}.json`
            : `${key}.json`,
        );
    let bytes;
    try {
      bytes = await fs.readFile(cached);
    } catch (error) {
      if (local)
        throw new Error(
          `Missing acquired BA source ${local}. Run event source acquisition first.`,
          { cause: error },
        );
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Could not fetch ${url}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      JSON.parse(bytes.toString());
      await fs.writeFile(cached, bytes);
    }
    sources[key] = { bytes, data: JSON.parse(bytes.toString()) };
    provenance.inputs.push({
      key,
      url,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  if (sources.story.data.GroupId !== definition.group)
    throw new Error(`BA source group mismatch: ${definition.group}`);
  const prefix = `/private/ba-jp/${definition.group}`;
  const folder = path.join(root, 'public', prefix);
  await fs.mkdir(folder, { recursive: true });
  if (prepareOnly) {
    await fs.writeFile(path.join(folder, 'source.json'), sources.story.bytes);
    await fs.writeFile(
      path.join(folder, 'characters.json'),
      sources.characters.bytes,
    );
    await fs.writeFile(
      path.join(folder, 'provenance.json'),
      JSON.stringify(provenance),
    );
    console.log(`Prepared BA ${definition.group} source`);
    continue;
  }
  // Validate before replacing playable reader artifacts.
  const compiled = compileStory(sources.story.data, sources.characters.data);
  let hasEnglish = false;
  if (english?.[definition.group] && englishReleased.has(definition.group)) {
    try {
      localizeBaChapter(
        compiled,
        sources.story.data,
        { GroupId: definition.group, content: english[definition.group] },
        englishNames,
      );
      hasEnglish = true;
      provenance.english = englishProvenance;
    } catch (error) {
      console.log(
        `BA ${definition.group} retains Japanese only: ${error.message}`,
      );
    }
  }
  let sceneAssets = null;
  try {
    sceneAssets = JSON.parse(
      await fs.readFile(path.join(folder, 'assets.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (sceneAssets) {
    await enrichBaExpressions(sceneAssets);
    await fs.writeFile(
      path.join(folder, 'assets.json'),
      JSON.stringify(sceneAssets),
    );
  }
  const program = sceneAssets
    ? compileBaScenes(sources.story.data, compiled, sceneAssets)
    : null;
  const presentationWarnings =
    program?.warnings?.filter(
      (warning) =>
        ['source-gap', 'unsupported-cutscene'].includes(warning.type) ||
        warning.expression,
    ) ?? [];
  if (program) {
    for (const node of compiled.nodes) {
      const row = sources.story.data.content[node.source?.row];
      if (row?.VoiceJp) node.voice = sceneAssets.voices[row.VoiceJp];
      if (node.kind === 'video') {
        const video = /(?:^|\n)#(?:video|videons2);([^\n;]+)/.exec(
          canonicalBaScript(row?.ScriptKr ?? ''),
        )?.[1];
        node.video = sceneAssets.videos?.[video];
        if (!node.video)
          throw new Error(`Missing movie for ${node.id}: ${video}`);
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
    await fs.writeFile(
      path.join(folder, 'scenes.json'),
      JSON.stringify(program),
    );
  }
  const revisionTag = createHash('sha256')
    .update(JSON.stringify(program ?? compiled))
    .digest('hex')
    .slice(0, 16);
  provenance.presentation = program ? 'original-scenes-and-audio' : 'text-only';
  if (sceneAssets)
    provenance.assets = {
      gameVersion: sceneAssets.gameVersion,
      manifest: `${prefix}/assets.json`,
      files: sceneAssets.files.length,
    };
  const write = (name, data) =>
    fs.writeFile(path.join(folder, name), JSON.stringify(data));
  await write('chapter.json', compiled);
  await fs.writeFile(path.join(folder, 'source.json'), sources.story.bytes);
  await fs.writeFile(
    path.join(folder, 'characters.json'),
    sources.characters.bytes,
  );
  await write('provenance.json', provenance);
  const episode = {
    id: compiled.id,
    game: 'ba',
    story: definition.story,
    title: definition.title,
    description: `JP Japanese text · ${compiled.coverage.choices} choice prompts · ${program ? `Original backgrounds, animated characters and music.${Object.keys(sceneAssets.voices).length ? ' Available Japanese voices.' : ''}${presentationWarnings.length ? ` ${presentationWarnings.length} presentation gaps are marked in the reader.` : ''}` : 'Text only.'}`,
    category: definition.category,
    order: definition.order,
    date: definition.date,
    minutes: Math.max(
      1,
      Math.ceil(
        compiled.nodes.reduce((n, node) => n + node.text.ja.length, 0) / 350,
      ),
    ),
    availability: 'available',
    capabilities: [
      'Japanese source text',
      'Original choices',
      ...(program
        ? [
            'Original backgrounds',
            'Spine characters',
            ...(Object.keys(sceneAssets.voices).length
              ? ['Japanese voice']
              : []),
            'Music and sound effects',
            ...(presentationWarnings.length
              ? ['Presentation gaps marked in reader']
              : []),
          ]
        : ['Text only']),
    ],
    origin: 'game',
    textLocales: hasEnglish ? ['ja', 'en'] : ['ja'],
    ...titleLocales[compiled.id],
    completionLabel: `${definition.title} 読了`,
    collectionId: definition.collectionId,
    collectionNotice: `${definition.sourceFile ? 'Japanese text from the acquired JP scenario database.' : 'Japanese text from a pinned BA Archive snapshot.'}${program ? ` Original JP assets from version ${sceneAssets.gameVersion}.` : ' Text only.'}`,
    ...(program ? {} : { readingMode: 'text' }),
    renderer: { id: program ? 'ba-scene' : 'text-only', payload: null },
    entryNodeId: compiled.entryNodeId,
    sourceUrl: `${prefix}/source.json`,
    content: {
      url: `${prefix}/chapter.json?v=${revisionTag}`,
      count: compiled.nodes.length,
      format: 'ba-text-v1',
      ...(program
        ? { sceneUrl: `${prefix}/scenes.json?v=${revisionTag}` }
        : {}),
    },
    assets: [
      ...[
        'chapter.json',
        'source.json',
        'characters.json',
        'provenance.json',
      ].map(
        (name) =>
          `${prefix}/${name}${name === 'chapter.json' ? `?v=${revisionTag}` : ''}`,
      ),
      ...(program
        ? [
            `${prefix}/scenes.json?v=${revisionTag}`,
            `${prefix}/assets.json`,
            ...sceneAssets.files.map((f) => f.url),
          ]
        : []),
    ],
    nodes: [],
  };
  imported.push(episode);
  console.log(
    `Imported ${compiled.id}: ${JSON.stringify(compiled.coverage)}. ${program ? 'Original JP visuals/audio.' : 'Text only.'}`,
  );
}
if (!prepareOnly) {
  await fs.mkdir(path.join(root, 'src/generated'), { recursive: true });
  const destination = path.join(root, 'src/generated/ba-stories.json');
  let previous = [];
  try {
    previous = JSON.parse(await fs.readFile(destination, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const ids = new Set(imported.map((e) => e.id));
  const episodes = [...previous.filter((e) => !ids.has(e.id)), ...imported];
  await fs.writeFile(destination, JSON.stringify(episodes, null, 2) + '\n');
}
