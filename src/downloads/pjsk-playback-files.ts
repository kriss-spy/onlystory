import reviewedRecipe from './pjsk-mmj-01-01.json';

const discoverySource =
  'https://storage.sekai.best/sekai-live2d-assets/live2d/model_list.json';

// Older prepared programs and text retain this import-time discovery descriptor.
// Normalize their runtime inventories without rewriting the hash-pinned bytes.
const discoveryFiles = reviewedRecipe.media.files.filter(
  (file) => file.sourceUrl === discoverySource,
);
const discoveryPaths = new Set(discoveryFiles.map((file) => file.url));

export const isPjskPlaybackAsset = (url: string) => !discoveryPaths.has(url);
export const isPjskPlaybackFile = (file: {
  url: string;
  sourceUrl?: string | null;
}) => file.sourceUrl !== discoverySource && isPjskPlaybackAsset(file.url);

export const pjskDiscoveryBytes = (assets: string[]) =>
  discoveryFiles.reduce(
    (total, file) => total + (assets.includes(file.url) ? file.bytes : 0),
    0,
  );
