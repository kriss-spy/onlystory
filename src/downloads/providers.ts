import type { Episode } from '../model';
import { baDownloadById } from './ba-catalog';

export const BA_IMPORT_ID = 'ba-jp-11000';
export const isBaImport = (episode: Episode) =>
  episode.id === BA_IMPORT_ID || baDownloadById.has(episode.id);
export const hasOnlineSource = (episode: Episode) =>
  isBaImport(episode) || !!episode.acquisition;

// Only add a story after verifying that its remaining blocker needs new reverse
// engineering. The current GFL audits establish source/implementation gaps only.
const reverseEngineeringBlockers = new Set<string>();
export const needsFurtherReverseEngineering = (episode: Episode) =>
  reverseEngineeringBlockers.has(episode.id) && !hasOnlineSource(episode);

declare global {
  interface Window {
    onlystoryDesktop?: {
      platform: 'win32' | 'darwin' | 'linux';
      readOriginal: (id: number) => Promise<Uint8Array<ArrayBuffer>>;
      cancelDownloads: () => Promise<void>;
      convertMedia?: (
        id: string,
        inputs: Uint8Array<ArrayBuffer>[],
      ) => Promise<Uint8Array<ArrayBuffer>>;
    };
  }
}
