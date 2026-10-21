import data from './pjsk-catalog.json';
import type { Episode } from '../model';

export const pjskDownloads = data as {
  episode: Episode;
  recipe: string;
  sha256: string;
  bytes: number;
  downloadBytes: number;
}[];
export const pjskDownloadById = new Map(
  pjskDownloads.map((entry) => [entry.episode.id, entry]),
);
