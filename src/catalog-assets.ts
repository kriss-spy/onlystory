import assets from './catalog-assets.json';

/** Release-local art is part of the app shell, independent of downloaded stories. */
export function catalogAssetUrl(url: string) {
  return (assets as Record<string, { url: string }>)[url]?.url ?? url;
}
