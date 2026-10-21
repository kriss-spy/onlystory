import artwork from './cover-art.json';
import type { CSSProperties } from 'react';
import { catalogAssetUrl } from './catalog-assets';

export interface CoverArt {
  url: string;
  position: string;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  kind?: 'official-game-art' | 'unofficial-art';
  credit?: string;
  page?: string;
  logo?: { url: string; width: number; height: number };
}

export const artworkStyle = (cover: CoverArt): CSSProperties => ({
  objectPosition: cover.position,
  ...(cover.fit ? { objectFit: cover.fit } : {}),
  ...(cover.fit === 'contain'
    ? { aspectRatio: `${cover.width} / ${cover.height}`, height: 'auto' }
    : {}),
});

const bundled = (cover: CoverArt | undefined): CoverArt | undefined =>
  cover && {
    ...cover,
    url: catalogAssetUrl(cover.url),
    ...(cover.logo
      ? { logo: { ...cover.logo, url: catalogAssetUrl(cover.logo.url) } }
      : {}),
  };

export const gameArtwork = (game: string): CoverArt | undefined =>
  bundled((artwork.games as Record<string, CoverArt>)[game]);

export const groupArtwork = (
  game: string,
  group: string,
): CoverArt | undefined =>
  bundled((artwork.groups as Record<string, CoverArt>)[`${game}:${group}`]);

export const eventArtwork = (event: {
  game: string;
  id: string;
}): CoverArt | undefined =>
  bundled(
    (artwork.events as Record<string, CoverArt>)[`${event.game}:${event.id}`],
  );
