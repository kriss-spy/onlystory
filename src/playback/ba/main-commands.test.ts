import { it, expect } from 'vitest';
import { canonicalBaScript } from './script';
import { applyBaRow, initialBaState, rowDelay } from './state';
import { emotionComposition } from './emotion-composition';
import { parseBaText } from './markup';
import emotions from './emotions.json';
import type { BaRow } from './types';
import {
  baSoundForRow,
  baSourceGaps,
  validateBaSourceGaps,
} from './source-gaps';

const row = (ScriptKr: string, TextJp = '') =>
  ({
    row: 0,
    ScriptKr,
    TextJp,
    BGName: 0,
    BGMId: 0,
    BGEffect: 0,
    Sound: '',
    Transition: 0,
  }) as BaRow;
it('keeps finite scene effects row-local and scopes absent sounds to their authored row', () => {
  const state = applyBaRow(initialBaState(), row('#fx;Shot_Center;-100;50'));
  expect(state.globalFx).toEqual([{ name: 'Shot_Center', x: -100, y: 50 }]);
  expect(applyBaRow(state, row('')).globalFx).toEqual([]);
  const sourceGaps = baSourceGaps(11080);
  const cue = { GroupId: 11080, row: 229, Sound: 'fade1' };
  expect(baSoundForRow(cue, { sourceGaps })).toBe('');
  expect(baSoundForRow({ ...cue, row: 230 }, { sourceGaps })).toBe('fade1');
  const content: Record<string, unknown>[] = [];
  content[229] = { Sound: 'fade1' };
  expect(() =>
    validateBaSourceGaps({ GroupId: 11080, content }, sourceGaps),
  ).not.toThrow();
  expect(() =>
    validateBaSourceGaps({ GroupId: 11080, content }, [
      { ...sourceGaps[0], row: 230 },
    ]),
  ).toThrow(/Unsupported BA source-gap/);
});
it('normalizes authored command casing without changing identifiers or face names', () => {
  expect(
    canonicalBaScript(
      '3;체리노;s2_05;hello\n#3;BLACK\n#NA;narration\n#3;FallDownL',
    ),
  ).toBe('3;체리노;s2_05;hello\n#3;black\n#na;narration\n#3;falldownL');
  expect(rowDelay(row('#3;FallDownR'))).toBe(600);
});
it('applies white silhouettes and genuine next-episode and right-aligned text cards', () => {
  const state = applyBaRow(initialBaState(), row('3;actor;01;hello\n#3;white'));
  expect(state.actors.actor.whiteSilhouette).toBe(true);
  expect(
    applyBaRow(state, row('#nextepisode;다음화;파국', '次回;破局')).title,
  ).toBe('次回\n破局');
  const caption = applyBaRow(
    state,
    row('#str;[1360,-535];smooth;100;caption', '夢が残した足跡'),
  ).captions[0];
  expect(caption).toMatchObject({
    x: 1360,
    y: -535,
    alignment: 'right',
    text: '夢が残した足跡',
  });
});
it('uses complete original pieces for newly encountered main-story emotion tokens', () => {
  expect(emotions.r).toBe(emotions['[반응]']);
  expect(emotionComposition(emotions.a).pieces).toHaveLength(3);
  expect(
    emotionComposition(emotions['[훌쩍]']).pieces.map((piece) => piece.sprite),
  ).toEqual(['Emoji_Tear_1', 'Emoji_Tear_2']);
  expect(
    emotionComposition(emotions['[전구]']).pieces.map((piece) => piece.sprite),
  ).toEqual(['Emoji_Balloon_N', 'Emoji_Bulb_1', 'Emoji_Bulb_2']);
  expect(emotionComposition(emotions['[zzz]']).pieces).toHaveLength(3);
});
it('keeps log/ruby metadata out of visible text while retaining authored character pauses', () => {
  expect(parseBaText('[log]あっ、そうだ！[/log]').text).toBe('あっ、そうだ！');
  const parsed = parseBaText(
    '[log=나구사ND]私は[wa:2500][ruby=ごりょう]御稜[/ruby]ナグサ。[/log]',
  );
  expect(parsed.text).toBe('私は御稜ナグサ。');
  expect(parsed.pauses).toEqual([{ offset: 2, delay: 2500 }]);
  const caption = applyBaRow(
    initialBaState(),
    row(
      '#stm;[0,0];serial;70;caption',
      '[wa:550][log=나구사ND]みんな、[wa:1550]壊れてく。[/log]',
    ),
  ).captions[0];
  expect(caption.text).toBe('みんな、壊れてく。');
  expect(caption.pauses).toEqual([
    { offset: 0, delay: 550 },
    { offset: 4, delay: 1550 },
  ]);
  expect(caption.instant).toBe(false);
});
