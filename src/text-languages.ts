import type { Locale } from './model';

const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': 'Chinese',
  ja: 'Japanese',
};

export function supportedTextLanguages(
  stories: readonly {
    textLocales?: readonly Locale[];
    content?: { count: number };
    nodes: readonly unknown[];
  }[],
) {
  return (Object.entries(languageNames) as [Locale, string][]).flatMap(
    ([locale, name]) => {
      const count = stories.filter(
        (story) =>
          (story.content?.count ?? story.nodes.length) > 0 &&
          story.textLocales?.includes(locale),
      ).length;
      return count ? [{ locale, name, count, total: stories.length }] : [];
    },
  );
}
