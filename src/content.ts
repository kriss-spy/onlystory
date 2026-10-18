import imported from './generated/gfl2-opening.json';
import eventImport from './generated/gfl2-event.json';
import ilionImport from './generated/gfl2-ilion.json';
import ilionScenes from './generated/gfl2-ilion-scenes.json';
import sceneImport from './generated/gfl2-scenes.json';
import packageImport from './generated/gfl2-packages.json';
import baImport from './generated/ba-stories.json';
import { decodeBaChapter } from './playback/ba/text';
import { decodeTextSection } from './playback/gfl2/text';
import { decodePjskText } from './playback/pjsk/text';
import type { FullEvent } from './playback/gfl2/text';
import { episodes as examples } from './fixtures';
import type { Episode } from './model';
import type { Opening } from './playback/gfl2/types';
import { eventIdFor, groupStoryEvents } from './catalog';
import { gameArtwork } from './covers';
import { decodeGfl1Story } from './playback/gfl1/story';
// New integrations remain optional in a clean checkout or restored GFL2 library.
const gfl1Imports = import.meta.glob('./generated/gfl1-catalog.json', {
  eager: true,
  import: 'default',
});
const gfl1Episodes = (Object.values(gfl1Imports)[0] ?? []) as Episode[];
export { games, gameById, backgroundUrl, stressEpisodes } from './fixtures';

const opening = imported as Opening | null;
const plain = (text: string) =>
  text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:color|size|b|i|u|s|font|style)(?:=[^>]*)?>/gi, '')
    .replace(/\\n/g, '\n');
const openingEpisodes: Episode[] = opening
  ? [
      {
        id: 'gfl2-a33001-opening',
        game: 'gfl2',
        title: opening.title,
        story: '长梦初醒 · 开场片段',
        description:
          '12 段原文开场，原始 CG、音乐与音效。截至首次角色演出之前。',
        category: 'Event',
        order: 1,
        date: '2026-10-15',
        minutes: 4,
        availability: 'available',
        capabilities: [
          'Original Chinese text',
          'Original CGs',
          'BGM & sound effects',
        ],
        origin: 'game',
        collectionId: 'gfl2-opening-preview',
        preview: !!eventImport,
        textLocales: ['zh-CN'],
        completionLabel: '开场片段结束 · 后续角色演出尚未接入',
        assets: opening.importedFrom.files.map((file) => file.url),
        renderer: { id: 'gfl2-avg-excerpt', payload: opening },
        nodes: opening.steps.map((step, index) => ({
          id: `A33001:${step.source.row}`,
          kind: index === opening.steps.length - 1 ? 'end' : 'text',
          speaker: plain(step.speaker),
          text: { en: plain(step.text), 'zh-CN': plain(step.text) },
          scene: {
            background: 'platform',
            actors: [],
            window:
              step.window === 'AVGWindowFull'
                ? 'system'
                : step.window === 'AVGWindow'
                  ? 'dialogue'
                  : 'narration',
          },
          next: opening.steps[index + 1]
            ? `A33001:${opening.steps[index + 1].source.row}`
            : undefined,
          source: { ...step.source, index },
        })),
      },
    ]
  : [];

export const fullEvent = eventImport as FullEvent | null;
type SceneSections = Record<
  string,
  { url: string; bytes: number; unresolved: number }
>;
const scenesOf = (manifest: unknown): SceneSections =>
  (manifest as { sections?: SceneSections } | null)?.sections ?? {};
function eventEpisodes(
  event: FullEvent,
  sceneSections: SceneSections,
  collectionId: string,
  date: string,
): Episode[] {
  return event.sections.map((section, index) => ({
    id: section.id,
    game: 'gfl2',
    title: section.title,
    story: event.title,
    category: 'Event',
    order: section.order,
    description: `${section.textRows} 段原文 · ${sceneSections[section.id] ? '原始背景、Live2D 角色与音乐' : '文字模式 · 角色、场景与音频尚未还原'}${event.pendingChapters?.length ? ' · 后续篇章尚未开放' : ''}`,
    date,
    minutes: Math.max(1, Math.ceil(section.characters / 350)),
    availability: 'available',
    capabilities: [
      'Original Chinese text',
      'Resolved speakers',
      'Original script order',
      ...(sceneSections[section.id]
        ? ['Original backgrounds', 'Live2D characters', 'BGM & sound effects']
        : []),
    ],
    origin: 'game',
    textLocales: ['zh-CN'],
    completionLabel:
      index === event.sections.length - 1
        ? `${event.title} · ${event.pendingChapters?.length ? '已开放篇章阅读完毕' : '全文阅读完毕'}`
        : '本节阅读完毕',
    collectionId,
    collectionNotice: event.pendingChapters
      ?.map((chapter) => `${chapter.title}将于 ${chapter.releaseDate} 开放。`)
      .join(' '),
    chapter: section.chapter,
    placement: section.placement,
    readingMode: sceneSections[section.id] ? undefined : 'text',
    nextEpisodeId: event.sections[index + 1]?.id,
    entryNodeId: section.firstNode,
    sourceUrl: section.sourceUrl,
    content: {
      url: section.contentUrl,
      count: section.textRows,
      format: 'gfl2-text-v1',
      sceneUrl: sceneSections[section.id]?.url,
    },
    renderer: {
      id: sceneSections[section.id] ? 'gfl2-event' : 'text-only',
      payload: null,
    },
    nodes: [],
    assets: [
      section.contentUrl,
      section.sourceUrl,
      ...(sceneSections[section.id] ? [sceneSections[section.id].url] : []),
    ],
  }));
}
export const realEpisodes: Episode[] = [
  ...(baImport as Episode[]),
  ...(fullEvent
    ? eventEpisodes(
        fullEvent,
        scenesOf(sceneImport),
        'gfl2-activity33-text',
        '2026-09-01',
      )
    : openingEpisodes),
  ...(ilionImport
    ? eventEpisodes(
        ilionImport as FullEvent,
        scenesOf(ilionScenes),
        'gfl2-ilion',
        '2026-06-30',
      )
    : []),
  ...(
    packageImport as {
      event: FullEvent & { id: string; date: string; releaseDate?: string };
      scenes: unknown;
    }[]
  ).flatMap(({ event, scenes }) =>
    eventEpisodes(
      event,
      scenesOf(scenes),
      event.id,
      event.releaseDate ?? event.date,
    ),
  ),
  ...gfl1Episodes,
];

// Keep existing excerpt links, saves and bookmarks working. It is a separate
// presentation preview, not a duplicate chapter in the main event catalog.
export const episodes = [
  ...Object.values(
    import.meta.glob<Episode>('./generated/pjsk-*.json', {
      eager: true,
      import: 'default',
    }),
  ),
  ...realEpisodes,
  ...(fullEvent ? openingEpisodes : []),
  ...examples,
];
export const episodeById = (id: string | undefined) =>
  episodes.find((episode) => episode.id === id);
export const storyEvents = groupStoryEvents(episodes);
export const eventById = (game: string | undefined, id: string | undefined) =>
  storyEvents.find((event) => event.game === game && event.id === id);
export const eventForEpisode = (episode: Episode) =>
  eventById(episode.game, eventIdFor(episode))!;
const loaded = new Map<string, Promise<Episode>>();
export function loadEpisode(episode: Episode): Promise<Episode> {
  if (!episode.content) return Promise.resolve(episode);
  const url = episode.content.url;
  const key = `${episode.id}:${episode.content.format}:${episode.content.count}:${episode.entryNodeId}:${url}`;
  const pending = loaded.get(key);
  if (pending) return pending;
  const result = (async () => {
    const cache =
      'caches' in window
        ? await caches.open('onlystory.media.v1').catch(() => null)
        : null;
    const response = (await cache?.match(url)) ?? (await fetch(url));
    if (
      !response.ok ||
      response.headers.get('content-type')?.includes('text/html')
    )
      throw new Error(
        'This chapter text is unavailable. Download it while connected, or retry.',
      );
    const input = await response.json();
    if (episode.content?.format === 'gfl1-story-v1')
      return decodeGfl1Story(input, episode);
    if (episode.content?.format === 'ba-text-v1') {
      const chapter = decodeBaChapter(input, episode);
      if (!episode.content.sceneUrl) return chapter;
      const response =
        (await cache?.match(episode.content.sceneUrl)) ??
        (await fetch(episode.content.sceneUrl));
      if (
        !response.ok ||
        response.headers.get('content-type')?.includes('text/html')
      )
        throw new Error(
          'The BA scene is unavailable. Download it while connected, or retry.',
        );
      const program =
        (await response.json()) as import('./playback/ba/types').BaProgram;
      if (
        program.version !== 1 ||
        program.id !== episode.id ||
        !Array.isArray(program.steps) ||
        program.steps.length !== chapter.nodes.length ||
        program.steps.some((s, i) => s.id !== chapter.nodes[i].id) ||
        !program.assets?.files?.length ||
        program.assets.files.some(
          (f) =>
            typeof f.url !== 'string' ||
            !/^\/private\/ba-jp\/(?:\d+|shared)\/media\/[^?#%]+$/.test(f.url) ||
            f.url.split('/').some((part) => part === '.' || part === '..') ||
            !Number.isSafeInteger(f.bytes) ||
            f.bytes < 0 ||
            !/^[a-f0-9]{64}$/.test(f.sha256) ||
            !episode.assets.includes(f.url),
        )
      )
        throw new Error(
          'The BA scene does not match this chapter. Reimport the source data.',
        );
      return { ...chapter, renderer: { id: 'ba-scene', payload: program } };
    }
    if (
      episode.content?.format !== 'gfl2-text-v1' &&
      episode.content?.format !== 'pjsk-text-v1'
    )
      throw new Error('This chapter format is unavailable.');
    const decoded =
      episode.content.format === 'pjsk-text-v1'
        ? decodePjskText(input, episode)
        : decodeTextSection(input, episode);
    if (!episode.content?.sceneUrl) return decoded;
    const sceneResponse =
      (await cache?.match(episode.content.sceneUrl)) ??
      (await fetch(episode.content.sceneUrl));
    if (
      !sceneResponse.ok ||
      sceneResponse.headers.get('content-type')?.includes('text/html')
    )
      throw new Error(
        'This chapter scene is unavailable. Retry while connected.',
      );
    const program =
      (await sceneResponse.json()) as import('./playback/gfl2/event-types').EventProgram;
    if (
      program.version !== 1 ||
      program.id !== episode.id ||
      program.steps.length !== decoded.nodes.length ||
      program.steps.some((step, index) => step.id !== decoded.nodes[index].id)
    )
      throw new Error(
        'The scene does not match this chapter. Reimport the original scripts.',
      );
    return {
      ...decoded,
      nodes: decoded.nodes.map((node) =>
        node.kind === 'video'
          ? {
              ...node,
              video: program.videos?.[node.video ?? '']?.url,
              videoSubtitles: program.videos?.[node.video ?? '']?.subtitles,
              videoVoices: program.videos?.[node.video ?? '']?.voices,
              femaleVideo: program.videos?.[node.video ?? '']?.female,
            }
          : node,
      ),
      renderer: { id: 'gfl2-event', payload: program },
      assets: [
        ...new Set([
          ...decoded.assets,
          ...program.files.map((file) => file.url),
        ]),
      ],
    };
  })();
  loaded.set(key, result);
  void result.catch(() => loaded.delete(key));
  return result;
}

export const gameCover = (game: string) => gameArtwork(game)?.url;
