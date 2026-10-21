import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { emptyData, parseData, mergeData } from './model';
import messages from './ui-messages.json';
import extraMessages from './ui-messages-extra.json';
import playbackMessages from './ui-messages-playback.json';
import libraryMessages from './ui-messages-library.json';

describe('application language', () => {
  it('preserves interpolation parameters in Chinese and Japanese messages', () => {
    expect(translate('zh-CN', 'App language')).toBe('应用语言');
    expect(translate('ja', 'App language')).toBe('アプリの言語');
    const placeholders = (text: string) =>
      (text.match(/\{\w+\}/g) ?? []).sort();
    for (const [source, entry] of Object.entries({
      ...messages,
      ...playbackMessages,
      ...extraMessages,
      ...libraryMessages,
    })) {
      for (const locale of ['zh-CN', 'ja'] as const) {
        expect(entry[locale].trim(), `${locale}: ${source}`).toBeTruthy();
        expect(placeholders(entry[locale]), `${locale}: ${source}`).toEqual(
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
