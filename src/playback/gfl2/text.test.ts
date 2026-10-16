import { expect, it } from 'vitest';
import { episodes } from '../../fixtures';
import { defaultPreferences, passageText } from '../../model';
import { decodeTextSection, textNodes } from './text';
import type { TextPassage } from './text';

const passage: TextPassage = {
  id: 'A33001:6',
  text: '<size=30>{}，他来了。</size>',
  textFemale: '{}，她来了。',
  speaker: '{}',
  speakerFemale: '{}',
  window: 'AVGWindow',
  source: { script: 'A33001', row: 6, contentId: 233001001 },
};
it('preserves original variants and substitutes player names literally', () => {
  const node = textNodes([passage])[0];
  expect(
    passageText(node, {
      ...defaultPreferences,
      playerName: '名字$&',
      textVariant: 'female',
    }),
  ).toEqual({ speaker: '名字$&', text: '名字$&，她来了。' });
  expect(
    passageText(node, { ...defaultPreferences, playerName: '' }).text,
  ).toBe('指挥官，他来了。');
  expect(node.text.en).toBe('{}，他来了。');
});
it('validates lazy chapter identity and original passage references before reading', () => {
  const episode = {
    ...episodes[0],
    id: 'chapter',
    entryNodeId: 'A33001:6',
    content: {
      url: '/chapter.json',
      count: 1,
      format: 'gfl2-text-v1' as const,
    },
  };
  expect(
    decodeTextSection({ id: 'chapter', passages: [passage] }, episode).nodes[0]
      .id,
  ).toBe('A33001:6');
  expect(() =>
    decodeTextSection({ id: 'other', passages: [passage] }, episode),
  ).toThrow('version');
  expect(() =>
    decodeTextSection(
      { id: 'chapter', passages: [{ ...passage, id: 'A33001:7' }] },
      episode,
    ),
  ).toThrow('invalid passage');
});
