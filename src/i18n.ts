import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import { useStore } from './store';
import type { Locale } from './model';
import messages from './ui-messages.json';
import extraMessages from './ui-messages-extra.json';
import playbackMessages from './ui-messages-playback.json';

const translations = { ...messages, ...playbackMessages, ...extraMessages };

export type TranslationParams = Record<string, string | number>;
export function translate(
  locale: Locale,
  source: string,
  params: TranslationParams = {},
) {
  const entry = (
    translations as Record<string, Partial<Record<Locale, string>>>
  )[source];
  const message = locale === 'en' ? source : (entry?.[locale] ?? source);
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : placeholder,
  );
}

const I18nContext = createContext({
  locale: 'en' as Locale,
  t: (source: string, params?: TranslationParams) =>
    translate('en', source, params),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const locale = data.preferences.uiLocale ?? 'en';
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      t: (source: string, params?: TranslationParams) =>
        translate(locale, source, params),
    }),
    [locale],
  );
  return createElement(I18nContext.Provider, { value }, children);
}

/** App chrome only. Catalog titles and authored story text have separate preferences. */
export function useI18n() {
  return useContext(I18nContext);
}
