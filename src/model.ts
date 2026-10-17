export type GameId = 'gfl2' | 'pjsk' | 'ba' | 'gfl1';
export type Locale = 'en' | 'zh-CN';
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
  background: 'platform' | 'observatory' | 'corridor';
  actors: Actor[];
  effect?: 'rain' | 'signal';
  window?: 'narration' | 'dialogue' | 'system';
}
export interface StoryNode {
  id: string;
  kind: 'text' | 'choice' | 'video' | 'unsupported' | 'end';
  speaker: string;
  text: Record<Locale, string>;
  scene: Scene;
  next?: string;
  choices?: {
    id: string;
    label: Record<Locale, string>;
    femaleLabel?: Record<Locale, string>;
    next: string;
  }[];
  voice?: string;
  video?: string;
  performance?: { title: string; notice: string };
  femaleVideo?: {
    url: string;
    voices?: StoryNode['videoVoices'];
    subtitles?: StoryNode['videoSubtitles'];
  };
  videoVoices?: Partial<Record<VoiceLanguage, { url: string }>>;
  videoSubtitles?: {
    url: string;
    language: string;
    label: string;
    default?: boolean;
  }[];
  bgm?: string;
  female?: { speaker: string; text: Record<Locale, string> };
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
  id: string;
  game: GameId;
  story: string;
  title: string;
  description: string;
  category: 'Main story' | 'Event' | 'Side story';
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
  chapter?: { id: string; title: string; order: number };
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
    format: 'gfl2-text-v1' | 'pjsk-text-v1';
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
  theme: 'system' | 'light' | 'dark';
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
export function passageText(node: StoryNode, preferences: Preferences) {
  const variant =
    preferences.textVariant === 'female' ? node.female : undefined;
  const name = preferences.playerName.trim() || '指挥官';
  return {
    speaker: (variant?.speaker ?? node.speaker).replaceAll('{}', () => name),
    text: (variant?.text ?? node.text)[preferences.textLocale].replaceAll(
      '{}',
      () => name,
    ),
  };
}
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
      node.id === line &&
      Object.entries(answers).every(
        ([id, answer]) =>
          !Array.isArray(answer) || (consumed[id] ?? 0) === answer.length,
      )
    )
      return save;
    const stateKey = `${node.id}|${JSON.stringify(consumed)}`;
    if (visited.has(stateKey)) break;
    visited.add(stateKey);
    const answer = answers[node.id];
    const selected = Array.isArray(answer)
      ? answer[consumed[node.id] ?? 0]
      : answer;
    const next = advance(episode, save, selected);
    if (next === save) break;
    if (Array.isArray(answer) && node.kind === 'choice')
      consumed[node.id] = (consumed[node.id] ?? 0) + 1;
    save = next;
  }
  throw new Error('This passage is unavailable on the selected story branch.');
}

export function resumeSave(episode: Episode, save: ReadingSave): ReadingSave {
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
      textLocale: ['en', 'zh-CN'],
      voice: ['zh-CN', 'ja'],
      source: ['device', 'server-preview'],
      textVariant: ['male', 'female'],
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
    preferences: imported.preferences,
    saves,
    bookmarks: mergePoints(current.bookmarks, imported.bookmarks),
    checkpoints: mergePoints(current.checkpoints, imported.checkpoints),
    installed: current.installed,
  };
}
