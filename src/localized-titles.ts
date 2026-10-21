import type { Episode, GameId, Preferences, TitleLocales } from './model';
import type { StoryEvent } from './catalog';

// Languages of the original titles in the imported regional catalogs.
export const originalTitleLocales: Record<GameId, keyof TitleLocales> = {
  ba: 'ja',
  pjsk: 'zh-CN',
  gfl1: 'en',
  gfl2: 'zh-CN',
};

export function catalogTitleLocales(episodes: Episode[], game: GameId) {
  return new Set([
    originalTitleLocales[game],
    ...episodes
      .filter((episode) => episode.game === game && episode.origin === 'game')
      .flatMap((episode) =>
        [episode.titleLocales, episode.collectionLocales].flatMap((locales) =>
          Object.entries(locales ?? {})
            .filter(([, title]) => title?.trim())
            .map(([locale]) => locale),
        ),
      ),
  ]);
}

export function localizedTitle(
  original: string,
  locales: TitleLocales | undefined,
  locale: Preferences['catalogLocale'],
) {
  return (locale && locale !== 'original' && locales?.[locale]) || original;
}

export const episodeTitle = (
  episode: Episode,
  locale: Preferences['catalogLocale'],
) => localizedTitle(episode.title, episode.titleLocales, locale);

export const collectionTitle = (
  event: StoryEvent,
  locale: Preferences['catalogLocale'],
) => localizedTitle(event.title, event.titleLocales, locale);

export const titleSearchValues = (episode: Episode) => [
  episode.title,
  episode.story,
  ...Object.values(episode.titleLocales ?? {}),
  ...Object.values(episode.collectionLocales ?? {}),
  ...(episode.titleAliases ?? []),
  ...(episode.collectionAliases ?? []),
];
