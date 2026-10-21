import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { emptyData, parseData, mergeData } from './model';
import messages from './ui-messages.json';

describe('application language', () => {
  it('translates settings in Chinese and Japanese with matching placeholders', () => {
    expect(translate('zh-CN', 'App language')).toBe('应用语言');
    expect(translate('ja', 'App language')).toBe('アプリの言語');
    for (const [source, entry] of Object.entries(messages)) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
      for (const locale of ['zh-CN', 'ja'] as const) {
        expect(entry[locale].trim(), source).not.toBe('');
        expect(placeholders(entry[locale]), source).toEqual(
          placeholders(source),
        );
      }
    }
  });
  it('keeps authored content separate and interpolates unknown messages safely', () => {
    expect(translate('ja', 'Unknown {count}', { count: 3 })).toBe('Unknown 3');
    expect(translate('en', '{name} {missing}', { name: '$&' })).toBe(
      '$& {missing}',
    );
  });
  it('validates and restores the global UI language without changing story preferences', () => {
    const data = emptyData();
    data.preferences.uiLocale = 'ja';
    const restored = parseData(JSON.parse(JSON.stringify(data)));
    expect(restored.preferences.uiLocale).toBe('ja');
    expect(restored.preferences.textLocale).toBe(data.preferences.textLocale);
    expect(mergeData(emptyData(), restored).preferences.uiLocale).toBe('ja');
    expect(
      parseData({
        ...data,
        preferences: { ...data.preferences, uiLocale: 'invalid' },
      }).preferences.uiLocale,
    ).toBeUndefined();
  });
});
