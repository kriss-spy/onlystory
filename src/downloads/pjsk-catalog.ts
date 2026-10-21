import data from './pjsk-catalog.json';
import type { Episode } from '../model';
import { isPjskPlaybackAsset, pjskDiscoveryBytes } from './pjsk-playback-files';

export const pjskDownloads = (
  data as {
    episode: Episode;
    recipe: string;
    sha256: string;
    bytes: number;
    downloadBytes: number;
  }[]
).map((entry) => ({
  ...entry,
  downloadBytes: entry.downloadBytes - pjskDiscoveryBytes(entry.episode.assets),
  episode: {
    ...entry.episode,
    assets: entry.episode.assets.filter(isPjskPlaybackAsset),
  },
}));
export const pjskDownloadById = new Map(
  pjskDownloads.map((entry) => [entry.episode.id, entry]),
);
