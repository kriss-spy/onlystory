import { expect, it } from 'vitest';
import { supportedTextLanguages } from './text-languages';

it('reports partial translations without counting unavailable stories or title languages', () => {
  const stories = [
    {
      availability: 'available',
      content: { count: 4 },
      nodes: [],
      textLocales: ['ja', 'en'],
      titleLocales: { 'zh-CN': '标题' },
    },
    {
      availability: 'available',
      content: { count: 2 },
      nodes: [],
      textLocales: ['ja'],
    },
    {
      availability: 'incomplete',
      nodes: [],
      textLocales: ['ja', 'en', 'zh-CN'],
    },
  ] as const;
  expect(supportedTextLanguages(stories)).toEqual([
    { locale: 'en', name: 'English', count: 1, total: 3 },
    { locale: 'ja', name: 'Japanese', count: 2, total: 3 },
  ]);
});

it('does not advertise a language without available text', () => {
  expect(supportedTextLanguages([])).toEqual([]);
  expect(
    supportedTextLanguages([{ nodes: [], textLocales: ['zh-CN'] }]),
  ).toEqual([]);
});
