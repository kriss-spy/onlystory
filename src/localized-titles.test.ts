import { describe, expect, it } from 'vitest';
import titles from './pjsk-localized-titles.json';
import {
  catalogTitleLocales,
  localizedTitle,
  titleSearchValues,
} from './localized-titles';
import { matchesSearch } from './search';
import { emptyData, gamePreferences, parseData } from './model';
import type { Episode } from './model';

describe('verified catalog titles', () => {
  const entry = titles['pjsk-cn-event-1000001'];
  it('offers original and imported title languages, excluding blank translations and demo titles', () => {
    const episodes = [
      {
        game: 'ba',
        origin: 'game',
        titleLocales: { en: 'Story', 'zh-CN': ' ' },
      },
      { game: 'ba', origin: 'example', titleLocales: { 'zh-CN': '示例' } },
      { game: 'pjsk', origin: 'game', ...entry },
    ] as Episode[];
    expect([...catalogTitleLocales(episodes, 'ba')]).toEqual(['ja', 'en']);
    expect(catalogTitleLocales(episodes, 'pjsk')).toEqual(
      new Set(['zh-CN', 'en', 'ja']),
    );
    expect([...catalogTitleLocales(episodes, 'gfl1')]).toEqual(['en']);
    expect([...catalogTitleLocales(episodes, 'gfl2')]).toEqual(['zh-CN']);
  });
  it('displays the selected language and searches every available title', () => {
    expect(
      localizedTitle('雨过天晴的启明星', entry.collectionLocales, 'en'),
    ).toBe('First Star After the Rain');
    expect(
      localizedTitle('雨过天晴的启明星', entry.collectionLocales, 'ja'),
    ).toBe('雨上がりの一番星');
    expect(
      localizedTitle('雨过天晴的启明星', entry.collectionLocales, 'original'),
    ).toBe('雨过天晴的启明星');
    const values = titleSearchValues({
      title: '孤独的雨',
      story: '雨过天晴的启明星',
      ...entry,
    } as Episode);
    expect(matchesSearch('first star', values)).toBe(true);
    expect(matchesSearch('ひとりぼっち', values)).toBe(true);
    expect(matchesSearch('孤独', values)).toBe(true);
  });
  it('keeps the source title where a regional title is unavailable', () => {
    expect(localizedTitle('原文', { ja: '原文' }, 'en')).toBe('原文');
    const partial = Object.values(titles).find(
      (entry) => !('en' in entry.titleLocales),
    );
    expect(partial).toBeDefined();
    expect(localizedTitle('source', partial?.titleLocales, 'en')).toBe(
      'source',
    );
  });
  it('roundtrips scoped language choices and validates backups', () => {
    const data = emptyData();
    data.preferences.catalogLocale = 'en';
    data.preferences.games = { pjsk: { catalogLocale: 'ja' } };
    const restored = parseData(JSON.parse(JSON.stringify(data)));
    expect(gamePreferences(restored.preferences, 'pjsk').catalogLocale).toBe(
      'ja',
    );
    expect(gamePreferences(restored.preferences, 'ba').catalogLocale).toBe(
      'en',
    );
    expect(
      parseData({ version: 1, preferences: { catalogLocale: 'made-up' } })
        .preferences.catalogLocale,
    ).toBe('original');
  });
});
