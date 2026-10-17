import { createHash } from 'node:crypto';

export const regions = ['jp', 'en', 'cn', 'tc', 'kr'];
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const actions = {
  0: ['None', null],
  1: ['Talk', 'TalkData'],
  2: ['CharacterLayout', 'LayoutData'],
  3: ['InputName', null],
  4: ['CharacterMotion', 'LayoutData'],
  5: ['Selectable', null],
  6: ['SpecialEffect', 'SpecialEffectData'],
  7: ['Sound', 'SoundData'],
  8: ['CharacterLayoutMode', 'ScenarioSnippetCharacterLayoutModes'],
};
const knownEffects = new Set([
  ...Array.from({ length: 38 }, (_, i) => i),
  38,
  39,
  40,
  41,
  42,
  43,
  44,
]);
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function assetBase(region) {
  if (!regions.includes(region))
    throw new Error(`Unknown PJSK region: ${region}`);
  return `https://storage.sekai.best/sekai-${region}-assets/`;
}

export function safeAssetPath(path) {
  if (
    typeof path !== 'string' ||
    !/^[a-zA-Z0-9_./-]+$/.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Invalid PJSK asset path: ${path}`);
  return path;
}

export function masterUrl(region, kind) {
  assetBase(region);
  if (!['unit', 'event'].includes(kind))
    throw new Error(`Unknown story kind: ${kind}`);
  const repository =
    region === 'jp' ? 'sekai-master-db-diff' : `sekai-master-db-${region}-diff`;
  return `https://raw.githubusercontent.com/Sekai-World/${repository}/main/${kind === 'unit' ? 'unitStories' : 'eventStories'}.json`;
}

// Metadata supplies bundle paths. Scenario IDs alone do not locate an episode.
export function catalogEntries(master, region, kind) {
  assetBase(region);
  if (!Array.isArray(master))
    throw new Error('PJSK master data must be an array.');
  if (!['unit', 'event'].includes(kind))
    throw new Error(`Unknown story kind: ${kind}`);
  const entries = [];
  function add(chapter, episode, collection) {
    if (
      !Number.isSafeInteger(episode.id) ||
      episode.id < 0 ||
      !Number.isInteger(episode.episodeNo) ||
      typeof episode.title !== 'string'
    )
      throw new Error('Invalid episode metadata.');
    const scenarioId = safeAssetPath(episode.scenarioId);
    const bundle = safeAssetPath(chapter.assetbundleName);
    if (scenarioId.includes('/'))
      throw new Error('Scenario ID must be a filename.');
    entries.push({
      id: `pjsk-${region}-${kind}-${episode.id}`,
      region,
      kind,
      collection,
      chapterNo: chapter.chapterNo ?? null,
      episodeNo: episode.episodeNo,
      title: episode.title,
      label: episode.episodeNoLabel ?? null,
      scenarioId,
      path:
        kind === 'unit'
          ? `scenario/unitstory/${bundle}/${scenarioId}.asset`
          : `event_story/${bundle}/scenario/${scenarioId}.asset`,
      metadata: {
        chapter: {
          ...chapter,
          episodes: undefined,
          eventStoryEpisodes: undefined,
        },
        episode,
      },
    });
  }
  for (const item of master) {
    if (kind === 'unit') {
      if (!Array.isArray(item.chapters))
        throw new Error('Missing unit story chapters.');
      for (const chapter of item.chapters) {
        if (!Array.isArray(chapter.episodes))
          throw new Error('Missing unit story episodes.');
        for (const episode of chapter.episodes)
          add(chapter, episode, item.unit);
      }
    } else {
      if (!Array.isArray(item.eventStoryEpisodes))
        throw new Error('Missing event story episodes.');
      for (const episode of item.eventStoryEpisodes)
        add(item, episode, String(item.eventId));
    }
  }
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate episode ID: ${entry.id}`);
    ids.add(entry.id);
  }
  return entries;
}

export function decodeScenario(source, expectedId, { sourceScenarioId } = {}) {
  if (!object(source) || source.ScenarioId !== (sourceScenarioId ?? expectedId))
    throw new Error(`Scenario ID mismatch: expected ${expectedId}`);
  for (const name of [
    'Snippets',
    'TalkData',
    'LayoutData',
    'SpecialEffectData',
    'SoundData',
    'AppearCharacters',
    'FirstLayout',
  ])
    if (!Array.isArray(source[name]))
      throw new Error(`Missing scenario table: ${name}`);
  if (!source.Snippets.length) throw new Error('Scenario has no snippets.');
  const issues = [];
  const transcript = [];
  const dependencyMap = new Map();
  function dependency(kind, reference, location, candidatePath = null) {
    if (!reference) return;
    if (typeof reference !== 'string')
      throw new Error(`Invalid ${kind} reference at ${location}`);
    if (candidatePath) {
      try {
        safeAssetPath(candidatePath);
      } catch {
        issues.push({
          at: location,
          code: 'invalid-media-reference',
          kind,
          reference,
        });
        candidatePath = null;
      }
    }
    const key = `${kind}:${reference}`;
    if (!dependencyMap.has(key))
      dependencyMap.set(key, {
        kind,
        reference,
        locations: [],
        candidatePath,
        status: candidatePath ? 'unverified' : 'unresolved',
      });
    dependencyMap.get(key).locations.push(location);
  }
  const background = (name, at) =>
    dependency(
      'background',
      name,
      at,
      name ? `scenario/background/${name}/${name}.webp` : null,
    );
  const bgm = (name, at) => {
    // bgm00000 is the source's stop/silence sentinel, not a missing music file.
    if (name !== 'bgm00000')
      dependency(
        'bgm',
        name,
        at,
        name ? `sound/scenario/bgm/${name}/${name}.mp3` : null,
      );
  };
  function voices(records, at) {
    if (!Array.isArray(records)) throw new Error(`Invalid voice list at ${at}`);
    for (const voice of records) {
      if (!object(voice) || typeof voice.VoiceId !== 'string')
        throw new Error(`Invalid voice at ${at}`);
      dependency(
        'voice',
        voice.VoiceId,
        at,
        voice.VoiceId
          ? `sound/scenario/voice/${expectedId}/${voice.VoiceId}.mp3`
          : null,
      );
    }
  }
  background(source.FirstBackground, 'initial');
  bgm(source.FirstBgm, 'initial');
  for (const [index, character] of [
    ...source.AppearCharacters,
    ...source.FirstLayout,
  ].entries())
    dependency(
      'live2d-costume',
      character.CostumeType,
      `initial-character:${index}`,
    );
  for (const bundle of source.NeedBundleNames ?? [])
    dependency('bundle', bundle, 'NeedBundleNames');
  for (const bundle of source.IncludeSoundDataBundleNames ?? [])
    dependency('sound-bundle', bundle, 'IncludeSoundDataBundleNames');
  function effect(record, at) {
    if (!Number.isInteger(record.EffectType))
      throw new Error(`Invalid effect type at ${at}`);
    if (!knownEffects.has(record.EffectType))
      issues.push({ at, code: 'unknown-effect', value: record.EffectType });
    if (record.EffectType === 7)
      background(record.StringValSub || record.StringVal, at);
    if ([11, 17, 19, 15, 22].includes(record.EffectType))
      dependency(
        `effect-${record.EffectType}`,
        record.StringValSub || record.StringVal,
        at,
      );
    if (record.EffectType === 23)
      issues.push({
        at,
        code: 'interaction-required',
        value: 'SimpleSelectable',
      });
    if ([8, 18, 24].includes(record.EffectType)) {
      if (typeof record.StringVal !== 'string')
        throw new Error(`Invalid effect text at ${at}`);
      transcript.push({
        at,
        kind: record.EffectType === 24 ? 'fullscreen' : 'caption',
        speaker: '',
        text: record.StringVal,
        voices:
          record.EffectType === 24 && record.StringValSub
            ? [{ VoiceId: record.StringValSub }]
            : [],
      });
      if (record.EffectType === 24 && record.StringValSub)
        voices([{ VoiceId: record.StringValSub }], at);
    }
  }
  function sound(record, at) {
    if (!Number.isInteger(record.PlayMode))
      throw new Error(`Invalid sound mode at ${at}`);
    // Mode 6 requests a CRI BGM block transition. Preserve BgmBlockIndex;
    // extracted media does not provide the original block routing metadata.
    if (![0, 1, 2, 3, 4, 6].includes(record.PlayMode))
      issues.push({ at, code: 'unknown-sound-mode', value: record.PlayMode });
    bgm(record.Bgm, at);
    dependency('sound-effect', record.Se, at);
    dependency('sound-bundle', record.SeBundleName, at);
  }
  function referenced(table, index, at) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      !object(source[table]?.[index])
    )
      throw new Error(`Invalid ${table} reference ${index} at ${at}`);
    return source[table][index];
  }
  const timeline = source.Snippets.map((snippet, index) => {
    const at = `snippet:${index}`;
    if (
      !object(snippet) ||
      !Number.isInteger(snippet.Action) ||
      !Number.isInteger(snippet.ReferenceIndex) ||
      snippet.ReferenceIndex < 0 ||
      !Number.isFinite(snippet.Delay) ||
      snippet.Delay < 0 ||
      ![0, 1].includes(snippet.ProgressBehavior)
    )
      throw new Error(`Invalid timing or command at ${at}`);
    const [action, table] = actions[snippet.Action] ?? ['Unknown', null];
    const record = table ? referenced(table, snippet.ReferenceIndex, at) : null;
    if (action === 'Unknown')
      issues.push({ at, code: 'unknown-action', value: snippet.Action });
    if (['InputName', 'Selectable'].includes(action))
      issues.push({ at, code: 'interaction-required', value: action });
    if (action === 'Talk') {
      if (
        typeof record.Body !== 'string' ||
        typeof record.WindowDisplayName !== 'string'
      )
        throw new Error(`Invalid dialogue at ${at}`);
      transcript.push({
        at,
        kind: 'talk',
        speaker: record.WindowDisplayName,
        text: record.Body,
        voices: record.Voices,
      });
      voices(record.Voices, at);
      if (!Array.isArray(record.Motions))
        throw new Error(`Invalid motions at ${at}`);
      for (const motion of record.Motions) {
        dependency('motion', motion.MotionName, at);
        dependency('expression', motion.FacialName, at);
      }
      if (record.RequirePlayEffect)
        effect(
          referenced('SpecialEffectData', record.EffectReferenceIdx, at),
          `${at}:talk-effect`,
        );
      if (record.RequirePlaySound)
        sound(
          referenced('SoundData', record.SoundReferenceIdx, at),
          `${at}:talk-sound`,
        );
    }
    if (['CharacterLayout', 'CharacterMotion'].includes(action)) {
      if (![0, 1, 2, 3, 6].includes(record.Type))
        issues.push({ at, code: 'unknown-layout-type', value: record.Type });
      dependency('live2d-costume', record.CostumeType, at);
      dependency('motion', record.MotionName, at);
      dependency('expression', record.FacialName, at);
    }
    if (action === 'SpecialEffect') effect(record, at);
    if (action === 'Sound') sound(record, at);
    if (
      action === 'CharacterLayoutMode' &&
      ![0, 3].includes(record.CharacterLayoutMode)
    )
      issues.push({
        at,
        code: 'unknown-layout-mode',
        value: record.CharacterLayoutMode,
      });
    // Do not infer absolute timestamps: wait completion depends on runtime media.
    return { index, action, snippet, table, record };
  });
  if (!transcript.length)
    issues.push({ at: 'scenario', code: 'no-readable-text' });
  return {
    schemaVersion: 1,
    scenarioId: expectedId,
    playbackReady: false,
    initial: Object.fromEntries(
      Object.entries(source).filter(([key]) => key.startsWith('First')),
    ),
    timeline,
    transcript,
    dependencies: [...dependencyMap.values()],
    issues,
    source,
  };
}
