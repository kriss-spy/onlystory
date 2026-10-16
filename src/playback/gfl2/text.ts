import type { Episode, StoryNode } from '../../model';

export interface EventSection {
  id: string;
  title: string;
  order: number;
  scripts: string[];
  textRows: number;
  firstNode: string;
  lastNode: string;
  characters: number;
  contentUrl: string;
  sourceUrl: string;
  chapter?: Episode['chapter'];
  placement?: Episode['placement'];
}
export interface FullEvent {
  title: string;
  pendingChapters?: { id: number; title: string; releaseDate: string }[];
  sections: EventSection[];
  coverage: { scripts: number; sections: number; textRows: number };
}
export interface TextPassage {
  id: string;
  text: string;
  textFemale: string;
  speaker: string;
  speakerFemale: string;
  window: string;
  kind?: 'video' | 'end' | 'text' | 'choice';
  next?: string | null;
  choices?: { id: string; text: string; textFemale: string; next: string }[];
  video?: string;
  source: { script: string; row: number; contentId: number };
}
export const plainText = (text: string) =>
  text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:color|size|b|i|u|s|font|style)(?:=[^>]*)?>/gi, '')
    .replace(/\\n/g, '\n');
export function textNodes(passages: TextPassage[]): StoryNode[] {
  return passages.map((passage, index) => {
    const text = plainText(passage.text);
    const female = plainText(passage.textFemale);
    return {
      id: passage.id,
      kind: passage.kind ?? (index === passages.length - 1 ? 'end' : 'text'),
      video: passage.video,
      speaker: plainText(passage.speaker),
      text: { en: text, 'zh-CN': text },
      female: {
        speaker: plainText(passage.speakerFemale),
        text: { en: female, 'zh-CN': female },
      },
      scene: {
        background: 'platform',
        actors: [],
        window:
          passage.window === 'AVGWindowFull' ||
          passage.window === 'AVGRecordPaperDialog'
            ? 'system'
            : passage.window === 'AVGNarrator'
              ? 'narration'
              : 'dialogue',
      },
      source: { ...passage.source, index },
      next:
        passage.next !== undefined
          ? (passage.next ?? undefined)
          : passages[index + 1]?.id,
      choices: passage.choices?.map((option) => ({
        id: option.id,
        label: { en: plainText(option.text), 'zh-CN': plainText(option.text) },
        femaleLabel: {
          en: plainText(option.textFemale),
          'zh-CN': plainText(option.textFemale),
        },
        next: option.next,
      })),
    };
  });
}
export function decodeTextSection(input: unknown, episode: Episode): Episode {
  if (!input || typeof input !== 'object')
    throw new Error('The chapter file is invalid.');
  const value = input as { id?: unknown; passages?: unknown };
  if (
    value.id !== episode.id ||
    !Array.isArray(value.passages) ||
    value.passages.length !== episode.content?.count
  )
    throw new Error('The chapter does not match this library version.');
  const ids = new Set();
  for (const raw of value.passages) {
    const p = raw as TextPassage;
    if (
      !p ||
      typeof p.id !== 'string' ||
      (p.kind !== undefined &&
        !['video', 'end', 'text', 'choice'].includes(p.kind)) ||
      (p.kind === 'video' && typeof p.video !== 'string') ||
      ids.has(p.id) ||
      ['text', 'textFemale', 'speaker', 'speakerFemale', 'window'].some(
        (key) => typeof (raw as Record<string, unknown>)[key] !== 'string',
      ) ||
      !p.source ||
      !/^[A-Z][A-Z0-9_]*\d$/.test(p.source.script) ||
      !Number.isInteger(p.source.row) ||
      (p.id !== `${p.source.script}:${p.source.row}` &&
        !(
          p.kind === 'end' &&
          p.source.contentId === 0 &&
          p.id === `${p.source.script}:end`
        )) ||
      !Number.isInteger(p.source.contentId)
    )
      throw new Error('The chapter contains an invalid passage.');
    ids.add(p.id);
  }
  for (const p of value.passages as TextPassage[]) {
    if (p.next != null && !ids.has(p.next))
      throw new Error('Invalid passage target.');
    if (
      p.kind === 'choice' &&
      (!p.choices?.length ||
        p.choices.some(
          (c) =>
            !ids.has(c.next) ||
            typeof c.text !== 'string' ||
            typeof c.textFemale !== 'string',
        ) ||
        new Set(p.choices.map((c) => c.id)).size !== p.choices.length)
    )
      throw new Error('Invalid choice targets.');
  }
  const nodes = textNodes(value.passages as TextPassage[]);
  if (nodes[0]?.id !== episode.entryNodeId)
    throw new Error('The chapter entry has changed.');
  return { ...episode, nodes };
}
