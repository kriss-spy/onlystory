import chapter from '../../../public/private/ba-jp/11000/chapter.json';
import { describe, expect, it } from 'vitest';
import manifest from '../../generated/ba-stories.json';
import type { Episode, StoryNode } from '../../model';
import {
  advance,
  defaultPreferences,
  nodeOf,
  passageText,
  passageUrl,
  restorePassage,
  startSave,
} from '../../model';
import { decodeBaChapter } from './text';

const episode = manifest[0] as Episode;
const input = () => structuredClone(chapter);
describe('real BA prologue chapter', () => {
  it('accepts resolved JP event movie nodes and rejects external movie sources', () => {
    const value = input();
    const node = value.nodes.find(
      (entry) => entry.kind === 'text',
    )! as unknown as StoryNode;
    node.kind = 'video';
    node.video = '/private/ba-jp/shared/media/video/Event_PV_10000.mp4';
    expect(() => decodeBaChapter(value, episode)).not.toThrow();
    node.video = 'https://example.com/video.mp4';
    expect(() => decodeBaChapter(value, episode)).toThrow('invalid passage');
  });
  it('accepts scoped event/shared voice files and rejects traversal or external URLs', () => {
    for (const voice of [
      '/private/ba-jp/10000005/media/voice/line.ogg',
      '/private/ba-jp/shared/media/voice/line_1.ogg',
    ]) {
      const value = input();
      value.nodes.find((node) => node.kind === 'text')!.voice = voice;
      expect(() => decodeBaChapter(value, episode)).not.toThrow();
    }
    for (const voice of [
      'https://example.com/line.ogg',
      '/private/ba-jp/shared/media/voice/../line.ogg',
      '/private/ba-jp/shared/media/voice/line.ogg?next=other',
    ]) {
      const value = input();
      value.nodes.find((node) => node.kind === 'text')!.voice = voice;
      expect(() => decodeBaChapter(value, episode)).toThrow('invalid passage');
    }
  });
  it('keeps both response routes distinct and restores deep links through each choice', () => {
    const decoded = decodeBaChapter(input(), episode);
    for (const option of ['s1', 's2']) {
      let save = startSave(decoded);
      while (nodeOf(decoded, save).id !== '11000:190') {
        const node = nodeOf(decoded, save);
        save = advance(
          decoded,
          save,
          node.kind === 'choice' ? node.choices![0].id : undefined,
        );
      }
      save = advance(decoded, save, option);
      expect(nodeOf(decoded, save).id).toBe(
        option === 's1' ? '11000:191' : '11000:192',
      );
      const url = new URL(passageUrl(decoded, save), 'http://localhost');
      expect(
        restorePassage(
          decoded,
          url.searchParams.get('line')!,
          url.searchParams.get('choices'),
        ).frames,
      ).toEqual(save.frames);
      save = advance(decoded, save);
      expect(nodeOf(decoded, save).id).toBe('11000:194');
    }
    expect(decoded.nodes.filter((n) => n.kind === 'choice')).toHaveLength(7);
    expect(decoded.assets).toContain('/private/ba-jp/11000/source.json');
  });
  it('uses the BA name token and a BA default without mutating source text', () => {
    const node = decodeBaChapter(input(), episode).nodes.find((n) =>
      n.text.ja?.includes('[USERNAME]'),
    )!;
    expect(
      passageText(node, { ...defaultPreferences, textLocale: 'ja' }).text,
    ).toContain('プレイヤー');
    expect(
      passageText(node, { ...defaultPreferences, textLocale: 'en' }).text,
    ).toContain('Sensei');
    expect(passageText(node, defaultPreferences).text).not.toContain('指挥官');
    expect(
      passageText(node, { ...defaultPreferences, playerName: '$&' }).text,
    ).toContain('$&');
    expect(node.text.ja).toContain('[USERNAME]');
  });
  it('rejects mismatched identity, missing passages, broken choices and unreachable data', () => {
    const wrongId = input();
    wrongId.id = 'ba-jp-other';
    expect(() => decodeBaChapter(wrongId, episode)).toThrow('version');
    const missing = input();
    missing.nodes.pop();
    expect(() => decodeBaChapter(missing, episode)).toThrow('version');
    const badChoice = input();
    badChoice.nodes.find((n) => n.kind === 'choice')!.choices![0].next =
      'missing';
    expect(() => decodeBaChapter(badChoice, episode)).toThrow('choice');
    const unreachable = input();
    unreachable.nodes[0].next = '11000:end';
    expect(() => decodeBaChapter(unreachable, episode)).toThrow('unreachable');
  });
});
