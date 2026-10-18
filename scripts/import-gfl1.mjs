import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compileScript } from './gfl1-story.mjs';
import { libraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const eventTypes = JSON.parse(
  readFileSync(resolve(root, 'scripts/gfl1-event-types.json'), 'utf8'),
);
const input = resolve(
  process.env.ONLYSTORY_GFL1_EXTRACTED ||
    resolve(root, '.cache/gfl1/extracted.json'),
);
const stageDirectory = process.env.ONLYSTORY_GFL1_STAGE_DIR
  ? resolve(process.env.ONLYSTORY_GFL1_STAGE_DIR)
  : undefined;
if (!existsSync(input))
  throw new Error(
    'Extract the Steam EN resources first. See docs/gfl1-pipeline.md.',
  );
const extracted = JSON.parse(readFileSync(input, 'utf8'));
if (extracted.version !== 1 || extracted.region !== 'Steam EN')
  throw new Error('Expected a Steam EN GFL1 extraction.');
const write = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  const bytes = JSON.stringify(data, null, 2) + '\n';
  if (existsSync(file) && readFileSync(file, 'utf8') === bytes) return;
  const temporary = file + '.tmp';
  writeFileSync(temporary, bytes);
  renameSync(temporary, file);
};
const scripts = Object.keys(extracted.scripts);
const expected = Array.from({ length: 6 }, (_, i) => [
  `1-${i + 1}-1`,
  `1-${i + 1}-2`,
]).flat();
if (expected.some((script) => !scripts.includes(script)))
  throw new Error('Expected all 12 baseline Chapter 1 Normal scripts.');
const collectionsPath = resolve(
  process.env.ONLYSTORY_GFL1_COLLECTIONS ||
    resolve(root, '.cache/gfl1/collections.json'),
);
const eventScripts = scripts.filter((script) => script.startsWith('-'));
const sourceIssues = new Map(
  (extracted.selectionIssues ?? []).map((issue) => [issue.script, issue]),
);
const encodingProvenance = new Map(
  (extracted.encodingProvenance ?? []).map((entry) => [entry.script, entry]),
);
const collections = eventScripts.length
  ? JSON.parse(readFileSync(collectionsPath, 'utf8'))
  : { collections: [], sources: [] };
if (
  collections.version !== undefined &&
  (collections.version !== 1 || collections.region !== 'Steam EN')
)
  throw new Error('Expected Steam EN native collection metadata.');
const hasMainStory = collections.collections.some(
  (collection) => collection.category === 'Main story',
);
const entries = hasMainStory
  ? []
  : expected.map((script, index) => ({
      script,
      title: `1-${Math.floor(index / 2) + 1} · ${index % 2 ? 'Ending' : 'Opening'}`,
      collection: {
        id: 'gfl1-chapter-1-normal',
        title: `Chapter 1 · ${
          extracted.chapterConfig
            .split(/\r?\n/)
            .find((row) => row.startsWith('1|normal|'))
            ?.split('|')[2] || 'Awakening'
        }`,
      },
      section: undefined,
    }));
for (const collection of collections.collections) {
  if (collection.category === 'Main story') {
    const number = collection.chapterIds[0];
    const name = extracted.chapterConfig
      .split(/\r?\n/)
      .find((row) => row.startsWith(`${number}|normal|`))
      ?.split('|')[2];
    if (name) collection.title = `Chapter ${number} · ${name}`;
  }
  if (
    collection.category !== 'Main story' &&
    !['story', 'collaboration', 'special'].includes(eventTypes[collection.id])
  )
    throw new Error(
      `Classify the GFL1 event before importing: ${collection.id}`,
    );
  if (collection.excludedNativeScripts.length)
    throw new Error(`Native collection has missing scripts: ${collection.id}`);
  for (const section of collection.sections)
    for (const entry of section.scenes) {
      if (
        !scripts.includes(entry.script) &&
        !sourceIssues.has(entry.script) &&
        entry.sourceStatus !== 'missing'
      )
        throw new Error(`Extract native catalog script first: ${entry.script}`);
      entries.push({
        ...entry,
        title: /^1-\d+-[12]$/.test(entry.script)
          ? `${entry.script.split('-').slice(0, 2).join('-')} · ${entry.script.endsWith('-1') ? 'Opening' : 'Ending'}`
          : `${entry.title} · ${entry.phase.replaceAll('-', ' ')}`,
        collection,
        section,
      });
    }
}
if (hasMainStory)
  entries.sort((a, b) => a.collection.order - b.collection.order);
if (
  new Set(entries.map((entry) => entry.script)).size !== entries.length ||
  entries.filter((entry) => scripts.includes(entry.script)).length !==
    scripts.length
)
  throw new Error(
    'Every extracted script must occur exactly once in the catalog.',
  );
const sideScene = (entry) =>
  entry.orderStatus === 'trigger-dependent' ||
  entry.orderStatus === 'native-ancillary' ||
  entry.orderStatus === 'explicit-collaboration-extra' ||
  entry.orderStatus === 'unresolved' ||
  entry.phase === 'repeat-ending';
const releases = JSON.parse(
  readFileSync(resolve(root, 'scripts/gfl1-release-dates.json'), 'utf8'),
);
if (releases.version !== 1 || releases.region !== 'EN')
  throw new Error(
    'Expected verified first-release dates for the English server.',
  );
for (const id of new Set(entries.map((entry) => entry.collection.id))) {
  const release = releases.collections[id];
  if (
    !release ||
    release.region !== 'EN' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(release.date) ||
    !Number.isFinite(Date.parse(release.date)) ||
    new Date(release.date).toISOString().slice(0, 10) !== release.date ||
    !/^https:\/\//.test(release.source)
  )
    throw new Error(`Provide a sourced English-server release date for ${id}.`);
}
const assetUrls = (value) => {
  if (typeof value === 'string')
    return value.startsWith('/private/gfl1/') ? [value] : [];
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(assetUrls);
  return [];
};
const programs = new Map(
  entries.map((entry) => [
    entry.script,
    scripts.includes(entry.script)
      ? compileScript(entry.script, extracted.scripts[entry.script], extracted)
      : {
          version: 1,
          id: `gfl1-${entry.script}`,
          complete: false,
          frames: {},
          sourceRows: [],
          audit: [
            {
              ...sourceIssues.get(entry.script),
              sourceKind:
                sourceIssues.get(entry.script)?.kind ?? 'missing-source',
              kind: 'source-gap',
              script: entry.script,
              provenance: entry.provenance,
            },
          ],
          nodes: [
            {
              id: `${entry.script}:source-gap`,
              kind: 'unsupported',
              speaker: '',
              text: {
                en: 'This original scene is unavailable in the installed source files. The remaining stories can be read separately.',
                'zh-CN':
                  'This original scene is unavailable in the installed source files. The remaining stories can be read separately.',
              },
              scene: {
                background: 'platform',
                actors: [],
                window: 'narration',
              },
            },
          ],
        },
  ]),
);
const collectionAudits = (id) =>
  entries
    .filter((entry) => entry.collection.id === id)
    .flatMap((entry) => programs.get(entry.script).audit);
const collectionAuditCache = new Map(
  [...new Set(entries.map((entry) => entry.collection.id))].map((id) => [
    id,
    collectionAudits(id),
  ]),
);
const catalog = [];
const report = {
  region: extracted.region,
  archiveScripts: extracted.archive.length,
  importedScripts: 0,
  textRows: 0,
  sourceRows: 0,
  completeScenes: 0,
  blockedScenes: 0,
  missing: extracted.missing,
  sourceIssues: [...sourceIssues.values()],
  encodingProvenance: [...encodingProvenance.values()],
  chapters: [],
  collections: collections.collections,
  catalogSources: collections.sources,
  sources: extracted.sources,
  audioProvenance: extracted.audioProvenance,
  audioTemplate: extracted.audioTemplate,
  gameplayBackgroundAudit: extracted.gameplayBackgroundAudit,
  releaseDateProvenance: releases,
};
for (const [index, entry] of entries.entries()) {
  const { script, collection, section } = entry;
  const compiled = programs.get(script);
  if (!compiled.nodes.length) throw new Error(`Empty story script: ${script}`);
  const contentHash = createHash('sha256')
    .update(JSON.stringify(compiled, null, 2) + '\n')
    .digest('hex')
    .slice(0, 20);
  const contentUrl = `/private/gfl1/chapters/${script}.${contentHash}.json`;
  const rawSource = scripts.includes(script)
    ? Buffer.from(extracted.scripts[script], 'utf8')
    : sourceIssues.has(script)
      ? readFileSync(resolve(dirname(input), 'scripts', script + '.txt'))
      : undefined;
  const sourceUrl = rawSource
    ? `/private/gfl1/source/${script}.txt`
    : undefined;
  const encoding = encodingProvenance.get(script);
  let rawSourceUrl;
  if (encoding) {
    const original = readFileSync(
      resolve(dirname(input), 'scripts', script + '.txt'),
    );
    const hash = createHash('sha256').update(original).digest('hex');
    if (hash !== encoding.sha256)
      throw new Error(`Original encoding source hash mismatch: ${script}`);
    rawSourceUrl = `/private/gfl1/source/${script}.${hash.slice(0, 20)}.bin`;
    const originalPath = resolve(libraryRoot, '.' + rawSourceUrl);
    mkdirSync(dirname(originalPath), { recursive: true });
    writeFileSync(originalPath, original);
  }
  if (
    sourceIssues.get(script)?.sha256 &&
    createHash('sha256').update(rawSource).digest('hex') !==
      sourceIssues.get(script).sha256
  )
    throw new Error(`Archived source hash mismatch: ${script}`);
  const media = [...new Set(assetUrls(compiled.frames))];
  if (
    Object.values(compiled.frames).some((frame) =>
      frame.actors.some((actor) => actor.communication),
    )
  )
    media.push(...Object.values(compiled.communication ?? {}));
  // Fail before publishing a catalog that references unavailable local media.
  for (const url of media)
    if (!existsSync(resolve(libraryRoot, '.' + url)))
      throw new Error(`Missing extracted media: ${url}`);
  write(resolve(libraryRoot, '.' + contentUrl), compiled);
  if (sourceUrl) {
    const sourcePath = resolve(libraryRoot, '.' + sourceUrl);
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, rawSource);
  }
  const rows = compiled.nodes.filter((n) =>
    ['text', 'choice'].includes(n.kind),
  ).length;
  const next = entries
    .slice(index + 1)
    .find(
      (candidate) =>
        candidate.collection.id === collection.id && !sideScene(candidate),
    );
  const warnings = collection.audit?.unassigned.length
    ? ` ${collection.audit.unassigned.length} additional source scenes have unresolved replay placement.`
    : '';
  const missingMusic = [
    ...new Set(
      collectionAuditCache
        .get(collection.id)
        .filter((entry) => entry.kind === 'missing-bgm')
        .map((entry) => entry.cue),
    ),
  ];
  const limitations = collectionAuditCache
    .get(collection.id)
    .some((entry) => entry.kind === 'unavailable-native-credits')
    ? ' Native rolling credits are unavailable; source text is preserved.'
    : '';
  const missingEffects = new Set(
    collectionAuditCache
      .get(collection.id)
      .filter((entry) => entry.kind === 'missing-sound')
      .map((entry) => entry.cue),
  );
  const missingBackgrounds = new Set(
    collectionAuditCache
      .get(collection.id)
      .filter((entry) => entry.kind === 'missing-background')
      .map((entry) => entry.bin),
  );
  const blockedScenes = entries.filter(
    (entry) =>
      entry.collection.id === collection.id &&
      !programs.get(entry.script).complete,
  ).length;
  catalog.push({
    id: compiled.id,
    game: 'gfl1',
    story: collection.title,
    title: entry.title,
    description: `${rows} English passages · Steam global version${section ? ` · ${section.title}` : ''}`,
    category: collection.category ?? (section ? 'Event' : 'Main story'),
    ...(section && collection.category !== 'Main story'
      ? { eventType: eventTypes[collection.id] }
      : {}),
    order: index + 1,
    date: releases.collections[collection.id].date,
    minutes: Math.max(
      1,
      Math.ceil((extracted.scripts[script]?.length ?? 0) / 1000),
    ),
    availability: compiled.complete ? 'available' : 'incomplete',
    origin: 'game',
    textLocales: ['en'],
    capabilities: !compiled.sourceRows.length
      ? ['Source unavailable']
      : [
          'Original English text',
          'Original backgrounds',
          'Original portrait expressions',
          ...(Object.keys(extracted.audio).length ? ['BGM'] : []),
          ...(Object.keys(extracted.sfx ?? {}).length
            ? ['Original sound effects']
            : []),
        ],
    collectionId: collection.id,
    collectionNotice:
      (collection.eventType === 'collaboration'
        ? 'Mission story order from installed EN data. Triggered dialogue, alternate endings and scenes without a confirmed placement are listed separately.'
        : section
          ? 'Native replay order. Map and round dialogue retain their gameplay triggers and are listed separately; repeat endings are alternatives.'
          : 'Chapter 1 Normal, six missions.') +
      warnings +
      (missingBackgrounds.size
        ? ` ${missingBackgrounds.size} original backgrounds are unavailable in this installation.`
        : '') +
      (missingEffects.size
        ? ` ${missingEffects.size} original sound-effect cues remain unavailable.`
        : '') +
      (blockedScenes
        ? ` ${blockedScenes} scenes contain source gaps or unsupported interactions and stop at an explicit notice.`
        : '') +
      (missingMusic.length
        ? ` Original music cues unavailable in this installation: ${missingMusic.join(', ')}. Affected passages are silent.`
        : '') +
      ' Browser transitions, framing and text styling are approximate.' +
      limitations +
      (collection.id === 'gfl1-valhalla'
        ? ' Bar scenes use drink-outcome choices in place of ingredient mixing.'
        : '') +
      ' Dialogue voices are not imported.',
    ...(section
      ? {
          chapter: {
            id: section.id,
            title: section.title,
            order: section.order,
          },
        }
      : {}),
    ...(sideScene(entry)
      ? {
          placement: {
            kind: 'side',
            branch: script,
            title:
              entry.phase === 'unresolved'
                ? 'Placement unresolved'
                : entry.orderStatus === 'native-ancillary'
                  ? 'Additional gameplay scene'
                  : entry.phase === 'repeat-ending'
                    ? 'Alternate repeat ending'
                    : `Gameplay trigger: ${entry.phase}${entry.trigger ? ` ${entry.trigger}` : ''}`,
          },
        }
      : {}),
    completionLabel: 'Scene complete',
    nextEpisodeId:
      !sideScene(entry) && next ? `gfl1-${next.script}` : undefined,
    entryNodeId: compiled.nodes[0].id,
    nodes: [],
    assets: [
      contentUrl,
      ...(sourceUrl ? [sourceUrl] : []),
      ...(rawSourceUrl ? [rawSourceUrl] : []),
      ...media,
    ],
    sourceUrl,
    ...(rawSourceUrl
      ? { rawSourceUrl, sourceEncoding: encoding.encoding }
      : {}),
    renderer: { id: 'gfl1', payload: null },
    content: {
      url: contentUrl,
      count: compiled.nodes.length,
      format: 'gfl1-story-v1',
    },
  });
  report.importedScripts++;
  report.textRows += rows;
  report.sourceRows += compiled.sourceRows.length;
  if (compiled.complete) report.completeScenes++;
  else report.blockedScenes++;
  report.chapters.push({
    script,
    rows,
    complete: compiled.complete,
    audit: compiled.audit,
    sourceRows: compiled.sourceRows.length,
    orderStatus: entry.orderStatus ?? 'mission-filename',
    provenance: entry.provenance,
  });
}
write(
  stageDirectory
    ? resolve(stageDirectory, 'provenance.json')
    : resolve(libraryRoot, 'private/gfl1/provenance.json'),
  {
    ...report,
    archive: extracted.archive,
  },
);
write(
  stageDirectory
    ? resolve(stageDirectory, 'catalog.json')
    : resolve(root, 'src/generated/gfl1-catalog.json'),
  catalog,
);
write(
  stageDirectory
    ? resolve(stageDirectory, 'import-report.json')
    : resolve(root, '.cache/gfl1/import-report.json'),
  report,
);
console.log(
  `GFL1: ${catalog.length} scenes, ${report.textRows} English passages. Report: ${stageDirectory ? resolve(stageDirectory, 'import-report.json') : '.cache/gfl1/import-report.json'}`,
);
