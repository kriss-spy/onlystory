import { episodes } from './content';
import { stressEpisodes } from './fixtures';
import type { GameId } from './model';
import { eventUrl, type StoryEvent } from './catalog';

export function catalogMode(params: URLSearchParams) {
  return {
    examples: params.get('examples') === '1',
    previews: params.get('previews') === '1',
    stress:
      import.meta.env.DEV || import.meta.env.MODE === 'browser-test'
        ? Math.min(10000, Math.max(0, Number(params.get('stress')) || 0))
        : 0,
  };
}
export function catalogSource(
  game: GameId | undefined,
  mode: ReturnType<typeof catalogMode>,
) {
  if (!game) return [];
  if (mode.stress)
    return stressEpisodes(mode.stress).map((episode) => ({ ...episode, game }));
  return episodes.filter(
    (episode) =>
      episode.game === game &&
      (mode.examples
        ? !episode.origin
        : episode.origin === 'game' && !!episode.preview === mode.previews),
  );
}
export function modeSearch(params: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ['examples', 'previews', 'stress']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next.size ? `?${next}` : '';
}
export const catalogEventUrl = (event: StoryEvent, params: URLSearchParams) =>
  eventUrl(event) + modeSearch(params);
