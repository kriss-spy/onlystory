import artwork from './cover-art.json';

export interface CoverArt {
  url: string;
  position: string;
  width: number;
  height: number;
}

export const gameArtwork = (game: string): CoverArt | undefined =>
  (artwork.games as Record<string, CoverArt>)[game];

export const groupArtwork = (
  game: string,
  group: string,
): CoverArt | undefined =>
  (artwork.groups as Record<string, CoverArt>)[`${game}:${group}`];

export const eventArtwork = (event: {
  game: string;
  id: string;
}): CoverArt | undefined =>
  (artwork.events as Record<string, CoverArt>)[`${event.game}:${event.id}`];
