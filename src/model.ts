export type GameId = 'gfl2' | 'pjsk' | 'ba' | 'gfl1';
export type Locale = 'en' | 'zh-CN' | 'ja';
export type TitleLocales = Partial<Record<Locale, string>>;
export type LocalizedText = Record<'en' | 'zh-CN', string> & { ja?: string };
export type VoiceLanguage = 'zh-CN' | 'ja';
export type Availability = 'available' | 'remote' | 'incomplete';
export type Fixture =
  | 'normal'
  | 'missing-background'
  | 'missing-voice'
  | 'loading'
  | 'offline'
  | 'expired'
  | 'unsupported';
export interface Actor {
  name: string;
  position: 'left' | 'right';
  expression: 'neutral' | 'surprised' | 'smile';
}
export interface Scene {
  fontScale?: number;
  autoAdvance?: boolean;
  textPauses?: { offset: number; delay: number }[];
  textPausesLocales?: Partial<
    Record<Locale, { offset: number; delay: number }[]>
  >;
  background: 'platform' | 'observatory' | 'corridor';
  actors: Actor[];
  effect?: 'rain' | 'signal';
  window?: 'narration' | 'dialogue' | 'system';
}
export interface MovieTrack {
  mime: string;
  init: { url: string; bytes: number };
  segments: { url: string; bytes: number; start: number; duration: number }[];
}
export interface MovieStreams {
  duration: number;
  video: MovieTrack;
  audio: Partial<Record<VoiceLanguage, MovieTrack>>;
}
export interface StoryNode {
  id: string;
  kind: 'text' | 'choice' | 'video' | 'unsupported' | 'end';
  speaker: string;
  text: LocalizedText;
  speakerLocales?: LocalizedText;
  playerName?: {
    token: string;
    fallback: string;
    fallbackLocales?: LocalizedText;
  };
  scene: Scene;
  next?: string;
  choices?: {
    id: string;
    label: LocalizedText;
    femaleLabel?: LocalizedText;
    next: string;
  }[];
  voice?: string;
  video?: string;
  movieStreams?: MovieStreams;
  performance?: { title: string; notice: string };
  femaleVideo?: {
    url: string;
    voices?: StoryNode['videoVoices'];
    subtitles?: StoryNode['videoSubtitles'];
    streams?: MovieStreams;
  };
  videoVoices?: Partial<Record<VoiceLanguage, { url: string }>>;
  videoSubtitles?: {
    url: string;
    language: string;
    label: string;
    default?: boolean;
  }[];
  bgm?: string;
  female?: { speaker: string; text: LocalizedText };
  source?: { script: string; row: number; contentId: number; index: number };
}
export interface Game {
  id: GameId;
  name: string;
  shortName: string;
  description: string;
  accent: string;
  cover: Scene['background'];
}
export interface Episode {
  titleLocales?: TitleLocales;
  collectionLocales?: TitleLocales;
  acquisition?: 'pjsk-mmj-01-01-v1';
  titleAliases?: string[];
  collectionAliases?: string[];
  id: string;
  game: GameId;
  story: string;
  title: string;
  description: string;
  category:
    | 'Main story'
    | 'Event'
    | 'Side story'
    | 'Group story'
    | 'Mini story'
    | 'Relationship story';
  eventType?: 'story' | 'collaboration' | 'special';
  order: number;
  date: string;
  minutes: number;
  availability: Availability;
  capabilities: string[];
  nodes: StoryNode[];
  assets: string[];
  origin?: 'game';
  textLocales?: Locale[];
  completionLabel?: string;
  renderer?: { id: string; payload: unknown };
  readingMode?: 'text';
  preview?: boolean;
  collectionId?: string;
  group?: string;
  collectionNotice?: string;
  chapter?: {
    id: string;
    title: string;
    order: number;
    titleLocales?: TitleLocales;
  };
  placement?: {
    kind: 'side';
    branch: string;
    title?: string;
    after?: string;
  };
  nextEpisodeId?: string;
  entryNodeId?: string;
  sourceUrl?: string;
  content?: {
    url: string;
    count: number;
    format: 'gfl2-text-v1' | 'pjsk-text-v1' | 'gfl1-story-v1' | 'ba-text-v1';
    sceneUrl?: string;
  };
}
export interface Frame {
  node: string;
  answers: Record<string, string>;
}
export interface ReadingSave {
  episodeId: string;
  frames: Frame[];
  seen: string[];
  updatedAt: string;
  completed: boolean;
  videoTime: number;
}
export interface Bookmark {
  id: string;
  episodeId: string;
  label: string;
  snapshot: ReadingSave;
  createdAt: string;
}
export interface Preferences {
  uiLocale?: Locale;
  catalogLocale?: 'original' | Locale;
  catalogLayout?: 'list' | 'table' | 'grid';
  gameThemes?: Partial<Record<GameId, 'default' | GameId>>;
  games?: Partial<
    Record<
      GameId,
      Partial<
        Pick<
          Preferences,
          | 'textLocale'
          | 'catalogLocale'
          | 'voice'
          | 'playerName'
          | 'textVariant'
          | 'waitVoice'
          | 'voiceVolume'
          | 'theme'
          | 'dialogueOpacity'
        >
      >
    >
  >;
  theme: 'system' | 'light' | 'dark';
  dialogueOpacity?: number;
  layout: 'scene' | 'desk' | 'text';
  chaptersOpen: boolean;
  fontSize: number;
  textSpeed: number;
  autoDelay: number;
  waitVoice: boolean;
  reducedMotion: boolean;
  panelWidth: number;
  textLocale: Locale;
  voice: VoiceLanguage;
  musicVolume: number;
  soundVolume: number;
  voiceVolume: number;
  source: 'device' | 'server-preview';
  textVariant: 'male' | 'female';
  playerName: string;
}
export interface AppData {
  version: 1;
  preferences: Preferences;
  saves: Record<string, ReadingSave>;
  bookmarks: Bookmark[];
  checkpoints: Bookmark[];
  installed: Record<string, boolean>;
  installations?: Record<
    string,
    { files: string[]; voices: VoiceLanguage[]; variants?: string[] }
  >;
}

export const defaultPreferences: Preferences = {
  catalogLocale: 'original',
  theme: 'system',
  layout: 'scene',
  chaptersOpen: false,
  fontSize: 22,
  textSpeed: 45,
  autoDelay: 1.8,
  waitVoice: true,
  reducedMotion: false,
  panelWidth: 244,
  textLocale: 'en',
  voice: 'zh-CN',
  musicVolume: 0.18,
  soundVolume: 0.8,
  voiceVolume: 0.8,
  source: 'device',
  textVariant: 'male',
  playerName: '指挥官',
};
export const emptyData = (): AppData => ({
  version: 1,
  preferences: { ...defaultPreferences },
  saves: {},
  bookmarks: [],
  checkpoints: [],
  installed: {},
});
export const nodeOf = (episode: Episode, save: ReadingSave) =>
  episode.nodes.find((n) => n.id === save.frames.at(-1)?.node) ??
  episode.nodes[0];
export function gamePreferences(
  preferences: Preferences,
  game: GameId,
): Preferences {
  return {
    ...preferences,
    ...preferences.games?.[game],
    dialogueOpacity:
      preferences.games?.[game]?.dialogueOpacity ??
      preferences.dialogueOpacity ??
      (preferences.gameThemes?.[game] === 'ba' ? 0 : 1),
  };
}
export function passageText(node: StoryNode, preferences: Preferences) {
  const variant =
    preferences.textVariant === 'female' ? node.female : undefined;
  return {
    speaker: playerNameText(
      variant?.speaker ??
        (node.speakerLocales
          ? localizedText(node.speakerLocales, preferences.textLocale)
          : node.speaker),
      preferences,
      node.playerName,
    ),
    text: playerNameText(
      localizedText(variant?.text ?? node.text, preferences.textLocale),
      preferences,
      node.playerName,
    ),
  };
}
export function playerNameText(
  text: string,
  preferences: Preferences,
  playerName?: StoryNode['playerName'],
) {
  const customName = preferences.playerName.trim();
  const name = playerName
    ? customName && customName !== defaultPreferences.playerName
      ? customName
      : playerName.fallbackLocales
        ? localizedText(playerName.fallbackLocales, preferences.textLocale)
        : playerName.fallback
    : customName || '指挥官';
  return text.replaceAll(playerName?.token ?? '{}', () => name);
}
export const localizedText = (text: LocalizedText, locale: Locale) =>
  text[locale] || text.ja || text.en || text['zh-CN'];
export function startSave(episode: Episode): ReadingSave {
  return {
    episodeId: episode.id,
    frames: [{ node: episode.entryNodeId ?? episode.nodes[0].id, answers: {} }],
    seen: [],
    updatedAt: new Date().toISOString(),
    completed: false,
    videoTime: 0,
  };
}
export function markSeen(save: ReadingSave): ReadingSave {
  const node = save.frames.at(-1)!.node;
  return save.seen.includes(node)
    ? save
    : { ...save, seen: [...save.seen, node] };
}
export function advance(
  episode: Episode,
  save: ReadingSave,
  answer?: string,
): ReadingSave {
  const node = nodeOf(episode, save);
  if (node.kind === 'unsupported' || node.kind === 'end') return save;
  const choice =
    node.kind === 'choice'
      ? node.choices?.find((c) => c.id === answer)
      : undefined;
  const next = node.kind === 'choice' ? choice?.next : node.next;
  if (!next || !episode.nodes.some((n) => n.id === next)) return save;
  const answers = {
    ...save.frames.at(-1)!.answers,
    ...(choice ? { [node.id]: choice.id } : {}),
  };
  return {
    ...markSeen(save),
    frames: [...save.frames, { node: next, answers }],
    videoTime: 0,
    updatedAt: new Date().toISOString(),
    completed: episode.nodes.find((n) => n.id === next)?.kind === 'end',
  };
}
export function rewind(save: ReadingSave, index: number): ReadingSave {
  if (index < 0 || index >= save.frames.length) return save;
  return {
    ...save,
    frames: save.frames.slice(0, index + 1),
    completed: false,
    videoTime: 0,
    updatedAt: new Date().toISOString(),
  };
}
export function canFastForward(node: StoryNode): boolean {
  return node.kind === 'text';
}

// Only include the chosen branch. An unanswered choice or archive gap is the
// furthest position we can offer without inventing story state.
export function readingPath(
  episode: Episode,
  answers: Frame['answers'],
): Frame[] {
  const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const frames: Frame[] = [];
  let node = nodes.get(episode.entryNodeId ?? episode.nodes[0].id);
  let chosen: Frame['answers'] = {};
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    frames.push({ node: node.id, answers: chosen });
    if (node.kind === 'end' || node.kind === 'unsupported') break;
    if (node.kind === 'choice') {
      const selected = answers[node.id];
      const answer = node.choices?.find((choice) => choice.id === selected);
      if (!answer) break;
      chosen = { ...chosen, [node.id]: answer.id };
      node = nodes.get(answer.next);
    } else node = node.next ? nodes.get(node.next) : undefined;
  }
  return frames;
}

// Preserve actual visits, including quiz retries. Only the chosen continuation
// is seekable; the remaining graph supplies a locked scale beyond the next gate.
export function readingTimeline(
  episode: Episode,
  save: ReadingSave,
  remembered: Frame[] = [],
) {
  const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
  const frames = [...save.frames];
  let followsRemembered = frames.every(
    (frame, index) =>
      frame.node === remembered[index]?.node &&
      JSON.stringify(frame.answers) ===
        JSON.stringify(remembered[index]?.answers),
  );
  const visited = new Set<string>();
  let frame = frames.at(-1)!;
  while (!visited.has(frame.node)) {
    visited.add(frame.node);
    const node = nodes.get(frame.node);
    if (!node || node.kind === 'end' || node.kind === 'unsupported') break;
    const answer =
      node.kind === 'choice' && followsRemembered
        ? node.choices?.find(
            (choice) =>
              choice.id === remembered[frames.length]?.answers[node.id],
          )
        : undefined;
    const next = node.kind === 'choice' ? answer?.next : node.next;
    if (!next || !nodes.has(next) || visited.has(next)) break;
    frame = {
      node: next,
      answers: {
        ...frame.answers,
        ...(answer ? { [node.id]: answer.id } : {}),
      },
    };
    frames.push(frame);
    followsRemembered =
      followsRemembered &&
      frame.node === remembered[frames.length - 1]?.node &&
      JSON.stringify(frame.answers) ===
        JSON.stringify(remembered[frames.length - 1]?.answers);
  }
  const boundary = nodes.get(frames.at(-1)!.node);
  // Iterative postorder avoids recursion limits on long imported chapters.
  // Back edges are omitted from the estimate; actual repeated visits remain above.
  const depth = new Map<string, number>();
  const continuation = new Map<string, string>();
  const active = new Set<string>();
  const children = (id: string) => {
    const node = nodes.get(id);
    if (!node || node.kind === 'end' || node.kind === 'unsupported') return [];
    return node.kind === 'choice'
      ? (node.choices ?? []).map((choice) => choice.next)
      : node.next
        ? [node.next]
        : [];
  };
  if (boundary?.kind === 'choice') {
    const stack: { id: string; exit: boolean }[] = [
      { id: boundary.id, exit: false },
    ];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.exit) {
        const next = children(item.id)
          .filter((id) => !active.has(id) && depth.has(id))
          .sort((a, b) => depth.get(b)! - depth.get(a)!)[0];
        if (next) continuation.set(item.id, next);
        depth.set(
          item.id,
          1 +
            Math.max(
              0,
              ...children(item.id)
                .filter((id) => !active.has(id))
                .map((id) => depth.get(id) ?? 0),
            ),
        );
        active.delete(item.id);
      } else if (!depth.has(item.id) && !active.has(item.id)) {
        active.add(item.id);
        stack.push({ id: item.id, exit: true });
        for (const id of children(item.id))
          if (!active.has(id) && nodes.has(id)) stack.push({ id, exit: false });
      }
    }
  }
  const choices = frames.flatMap((frame, index) =>
    nodes.get(frame.node)?.kind === 'choice' ? [index] : [],
  );
  // Preview the same longest continuation used by the locked progress scale.
  // These markers never make unanswered branches seekable.
  const previewed = new Set<string>(boundary ? [boundary.id] : []);
  let next = boundary ? continuation.get(boundary.id) : undefined;
  let position = frames.length;
  while (next && !previewed.has(next)) {
    previewed.add(next);
    if (nodes.get(next)?.kind === 'choice') choices.push(position);
    position++;
    next = continuation.get(next);
  }
  const reachableNodes = new Set(frames.map((frame) => frame.node));
  const total =
    frames.length + Math.max(0, (depth.get(boundary?.id ?? '') ?? 1) - 1);
  return {
    frames,
    upcoming: [...depth].flatMap(([node, remaining]) =>
      reachableNodes.has(node)
        ? []
        : [
            {
              node,
              position: total - remaining,
            },
          ],
    ),
    total,
    choices,
    locked: boundary?.kind === 'choice',
  };
}

export function passageUrl(
  episode: Episode,
  save: ReadingSave,
  extra = new URLSearchParams(),
): string {
  const params = new URLSearchParams(extra);
  const frame = save.frames.at(-1)!;
  params.set('line', frame.node);
  if (
    new Set(save.frames.map((frame) => frame.node)).size !== save.frames.length
  ) {
    const visits: Record<string, string[]> = {};
    const choices = new Set(
      episode.nodes
        .filter((node) => node.kind === 'choice')
        .map((node) => node.id),
    );
    for (let i = 0; i < save.frames.length - 1; i++) {
      const node = save.frames[i].node;
      if (choices.has(node))
        (visits[node] ??= []).push(save.frames[i + 1].answers[node]);
    }
    params.set('choices', JSON.stringify(visits));
  } else if (Object.keys(frame.answers).length)
    params.set('choices', JSON.stringify(frame.answers));
  else params.delete('choices');
  return `/read/${episode.game}/${episode.id}?${params}`;
}

// GFL1 variants retain their original source row. Canonical links may name that
// row, while links naming a particular compiled variant must remain exact.
function gfl1SourceId(episode: Episode, node: StoryNode): string | undefined {
  if (episode.game !== 'gfl1' || episode.renderer?.id !== 'gfl1') return;
  if (
    typeof node.source?.script === 'string' &&
    node.source.script &&
    Number.isInteger(node.source.row) &&
    node.source.row > 0
  )
    return `${node.source.script}:${node.source.row}`;
  if (node.kind === 'end') {
    const script = node.id.match(/^(.+):end(?::state-\d+)?$/)?.[1];
    if (script) return `${script}:end`;
  }
}
function matchesPassage(episode: Episode, node: StoryNode, requested: string) {
  return node.id === requested || gfl1SourceId(episode, node) === requested;
}
export function restorePassage(
  episode: Episode,
  line: string,
  choices: string | null,
): ReadingSave {
  let answers: Record<string, string | string[]> = {};
  if (choices) {
    const value: unknown = JSON.parse(choices);
    if (
      !record(value) ||
      !Object.values(value).every(
        (v) =>
          typeof v === 'string' ||
          (Array.isArray(v) &&
            v.length > 0 &&
            v.length <= 1000 &&
            v.every((a) => typeof a === 'string')),
      )
    )
      throw new Error('The branch information in this link is invalid.');
    answers = value as Record<string, string | string[]>;
  }
  let save = startSave(episode);
  const consumed: Record<string, number> = {},
    visited = new Set<string>();
  for (let i = 0; i < 10000; i++) {
    const node = nodeOf(episode, save);
    if (
      matchesPassage(episode, node, line) &&
      Object.entries(answers).every(
        ([id, answer]) =>
          !Array.isArray(answer) || (consumed[id] ?? 0) === answer.length,
      )
    )
      return save;
    const stateKey = `${node.id}|${JSON.stringify(consumed)}`;
    if (visited.has(stateKey)) break;
    visited.add(stateKey);
    const canonical = gfl1SourceId(episode, node);
    const answerKey = Object.hasOwn(answers, node.id)
      ? node.id
      : (canonical ?? node.id);
    const answer = answers[answerKey];
    const selected = Array.isArray(answer)
      ? answer[consumed[answerKey] ?? 0]
      : answer;
    const next = advance(episode, save, selected);
    if (next === save) break;
    if (Array.isArray(answer) && node.kind === 'choice')
      consumed[answerKey] = (consumed[answerKey] ?? 0) + 1;
    save = next;
  }
  throw new Error('This passage is unavailable on the selected story branch.');
}

export function resumeSave(episode: Episode, save: ReadingSave): ReadingSave {
  if (episode.game === 'gfl1' && episode.renderer?.id === 'gfl1')
    return resumeGfl1Save(episode, save);
  if (
    save.frames.some(
      (frame) => !episode.nodes.some((node) => node.id === frame.node),
    )
  )
    throw new Error('This passage is unavailable in the current story.');
  let restored = startSave(episode);
  let valid =
    JSON.stringify(restored.frames[0]) === JSON.stringify(save.frames[0]);
  for (let i = 1; valid && i < save.frames.length; i++) {
    const previous = restored.frames.at(-1)!;
    const next = advance(
      episode,
      restored,
      save.frames[i].answers[previous.node],
    );
    valid =
      next !== restored &&
      JSON.stringify(next.frames.at(-1)) === JSON.stringify(save.frames[i]);
    restored = next;
  }
  if (!valid)
    throw new Error(
      'This saved path no longer matches the available story. Your original save has been kept.',
    );
  return {
    ...save,
    seen: save.seen.filter((id) =>
      episode.nodes.some((node) => node.id === id),
    ),
    completed: nodeOf(episode, restored).kind === 'end',
  };
}

function resumeGfl1Save(episode: Episode, save: ReadingSave): ReadingSave {
  if (!save.frames.length)
    throw new Error('This passage is unavailable in the current story.');
  const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
  for (const frame of save.frames)
    if (
      !episode.nodes.some((node) => matchesPassage(episode, node, frame.node))
    )
      throw new Error('This passage is unavailable in the current story.');
  let restored = startSave(episode);
  const reached = new Map<string, string>();
  const origins = new Map<string, string>();
  const latestAnswers = new Map<string, string>();
  function validFrame(original: Frame, actual: Frame) {
    if (!matchesPassage(episode, nodes.get(actual.node)!, original.node))
      return false;
    reached.set(original.node, actual.node);
    const projected: Frame['answers'] = {};
    for (const [key, value] of Object.entries(actual.answers)) {
      const origin = origins.get(key) ?? key;
      if (!latestAnswers.has(origin) || latestAnswers.get(origin) === key)
        projected[origin] = value;
    }
    return (
      Object.keys(projected).length === Object.keys(original.answers).length &&
      Object.entries(projected).every(
        ([key, value]) => original.answers[key] === value,
      )
    );
  }
  let valid = validFrame(save.frames[0], restored.frames[0]);
  for (let index = 1; valid && index < save.frames.length; index++) {
    const previous = nodes.get(restored.frames.at(-1)!.node)!;
    const original = save.frames[index];
    const canonical = gfl1SourceId(episode, previous);
    const answerKey = Object.hasOwn(original.answers, previous.id)
      ? previous.id
      : (canonical ?? previous.id);
    const next = advance(episode, restored, original.answers[answerKey]);
    if (previous.kind === 'choice' && next !== restored) {
      origins.set(previous.id, answerKey);
      latestAnswers.set(answerKey, previous.id);
    }
    valid = next !== restored && validFrame(original, next.frames.at(-1)!);
    restored = next;
  }
  if (!valid)
    throw new Error(
      'This saved path no longer matches the available story. Your original save has been kept.',
    );
  return {
    ...save,
    frames: restored.frames,
    seen: [
      ...new Set(
        save.seen
          .map((id) => reached.get(id) ?? id)
          .filter((id) => nodes.has(id)),
      ),
    ],
    completed: nodeOf(episode, restored).kind === 'end',
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseSave(value: unknown): ReadingSave | null {
  if (
    !record(value) ||
    typeof value.episodeId !== 'string' ||
    !Array.isArray(value.frames) ||
    !value.frames.length ||
    value.frames.length > 10000 ||
    !Array.isArray(value.seen)
  )
    return null;
  if (
    !value.frames.every(
      (f) =>
        record(f) &&
        typeof f.node === 'string' &&
        record(f.answers) &&
        Object.values(f.answers).every((a) => typeof a === 'string'),
    ) ||
    !value.seen.every((x) => typeof x === 'string')
  )
    return null;
  return {
    episodeId: value.episodeId,
    frames: value.frames as Frame[],
    seen: value.seen,
    completed: value.completed === true,
    updatedAt:
      typeof value.updatedAt === 'string'
        ? value.updatedAt
        : new Date().toISOString(),
    videoTime:
      typeof value.videoTime === 'number' && Number.isFinite(value.videoTime)
        ? Math.max(0, value.videoTime)
        : 0,
  };
}
export function parseData(input: unknown): AppData {
  if (!record(input) || input.version !== 1)
    throw new Error('This is not a supported Onlystory backup.');
  const data = emptyData();
  if (record(input.preferences)) {
    const p = input.preferences;
    for (const [key, allowed] of Object.entries({
      theme: ['system', 'light', 'dark'],
      layout: ['scene', 'desk', 'text'],
      textLocale: ['en', 'zh-CN', 'ja'],
      uiLocale: ['en', 'zh-CN', 'ja'],
      catalogLocale: ['original', 'en', 'zh-CN', 'ja'],
      voice: ['zh-CN', 'ja'],
      source: ['device', 'server-preview'],
      textVariant: ['male', 'female'],
      catalogLayout: ['list', 'table', 'grid'],
    }))
      if (allowed.includes(p[key] as string))
        Object.assign(data.preferences, { [key]: p[key] });
    for (const [key, min, max] of [
      ['fontSize', 16, 32],
      ['textSpeed', 0, 100],
      ['autoDelay', 0.5, 10],
      ['panelWidth', 180, 360],
      ['musicVolume', 0, 1],
      ['soundVolume', 0, 1],
      ['voiceVolume', 0, 1],
      ['dialogueOpacity', 0, 1],
    ] as const)
      if (typeof p[key] === 'number' && Number.isFinite(p[key]))
        Object.assign(data.preferences, {
          [key]: Math.max(min, Math.min(max, p[key])),
        });
    for (const key of ['waitVoice', 'reducedMotion', 'chaptersOpen'] as const)
      if (typeof p[key] === 'boolean') data.preferences[key] = p[key];
    // Migrate the previous sample-voice mute without losing the user's choice.
    if (p.voice === 'off') data.preferences.voiceVolume = 0;
    if (typeof p.playerName === 'string')
      data.preferences.playerName = p.playerName.slice(0, 40);
    if (record(p.games)) {
      data.preferences.games = {};
      for (const game of ['gfl2', 'pjsk', 'ba', 'gfl1'] as const) {
        const raw = p.games[game];
        if (!record(raw)) continue;
        const parsed = parseData({
          version: 1,
          preferences: Object.fromEntries(
            Object.entries(raw).filter(([key]) =>
              [
                'textLocale',
                'catalogLocale',
                'voice',
                'playerName',
                'textVariant',
                'waitVoice',
                'voiceVolume',
                'theme',
                'dialogueOpacity',
              ].includes(key),
            ),
          ),
        }).preferences;
        const scoped: NonNullable<Preferences['games']>[GameId] = {};
        for (const key of [
          'textLocale',
          'catalogLocale',
          'voice',
          'playerName',
          'textVariant',
          'waitVoice',
          'voiceVolume',
          'theme',
          'dialogueOpacity',
        ] as const)
          if (Object.hasOwn(raw, key))
            Object.assign(scoped, { [key]: parsed[key] });
        data.preferences.games[game] = scoped;
      }
    }
    if (record(p.gameThemes)) {
      data.preferences.gameThemes = {};
      for (const game of ['gfl2', 'pjsk', 'ba', 'gfl1'] as const) {
        const theme = p.gameThemes[game];
        if (['default', 'gfl2', 'pjsk', 'ba', 'gfl1'].includes(theme as string))
          data.preferences.gameThemes[game] = theme as GameId | 'default';
      }
    }
  }
  if (record(input.saves))
    for (const [id, raw] of Object.entries(input.saves)) {
      const save = parseSave(raw);
      if (save && save.episodeId === id) data.saves[id] = save;
    }
  if (Array.isArray(input.bookmarks))
    for (const raw of input.bookmarks.slice(0, 10000)) {
      if (
        !record(raw) ||
        typeof raw.id !== 'string' ||
        typeof raw.label !== 'string' ||
        typeof raw.episodeId !== 'string'
      )
        continue;
      const snapshot = parseSave(raw.snapshot);
      if (snapshot && snapshot.episodeId === raw.episodeId)
        data.bookmarks.push({
          id: raw.id,
          label: raw.label.slice(0, 200),
          episodeId: raw.episodeId,
          snapshot,
          createdAt:
            typeof raw.createdAt === 'string'
              ? raw.createdAt
              : snapshot.updatedAt,
        });
    }
  if (Array.isArray(input.checkpoints))
    for (const raw of input.checkpoints.slice(0, 10000)) {
      if (
        !record(raw) ||
        typeof raw.id !== 'string' ||
        typeof raw.label !== 'string' ||
        typeof raw.episodeId !== 'string'
      )
        continue;
      const snapshot = parseSave(raw.snapshot);
      if (snapshot && snapshot.episodeId === raw.episodeId)
        data.checkpoints.push({
          id: raw.id,
          label: raw.label.slice(0, 200),
          episodeId: raw.episodeId,
          snapshot,
          createdAt:
            typeof raw.createdAt === 'string'
              ? raw.createdAt
              : snapshot.updatedAt,
        });
    }
  if (record(input.installed))
    for (const [id, value] of Object.entries(input.installed))
      if (typeof value === 'boolean') data.installed[id] = value;
  if (record(input.installations)) {
    data.installations = {};
    for (const [id, value] of Object.entries(input.installations))
      if (
        record(value) &&
        Array.isArray(value.files) &&
        value.files.every(
          (url) =>
            typeof url === 'string' &&
            url.startsWith('/') &&
            !url.startsWith('//'),
        ) &&
        Array.isArray(value.voices)
      )
        data.installations[id] = {
          files: value.files as string[],
          voices: value.voices.filter(
            (voice): voice is VoiceLanguage =>
              voice === 'zh-CN' || voice === 'ja',
          ),
          ...(Array.isArray(value.variants)
            ? {
                variants: value.variants.filter(
                  (v): v is string =>
                    typeof v === 'string' &&
                    /^(male|female):(zh-CN|ja)$/.test(v),
                ),
              }
            : {}),
        };
  }
  return data;
}

export function mergeData(current: AppData, imported: AppData): AppData {
  const saves = { ...current.saves };
  for (const [id, save] of Object.entries(imported.saves)) {
    if (
      !saves[id] ||
      Date.parse(save.updatedAt) > Date.parse(saves[id].updatedAt)
    )
      saves[id] = save;
  }
  const mergePoints = (a: Bookmark[], b: Bookmark[]) => [
    ...new Map([...a, ...b].map((point) => [point.id, point])).values(),
  ];
  return {
    ...current,
    preferences: {
      ...current.preferences,
      ...imported.preferences,
      games: { ...current.preferences.games, ...imported.preferences.games },
      gameThemes: {
        ...current.preferences.gameThemes,
        ...imported.preferences.gameThemes,
      },
    },
    saves,
    bookmarks: mergePoints(current.bookmarks, imported.bookmarks),
    checkpoints: mergePoints(current.checkpoints, imported.checkpoints),
    installed: current.installed,
  };
}
