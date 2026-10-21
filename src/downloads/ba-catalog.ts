import catalog from './ba/catalog.json';
import prologue from './ba/recipe.json';
import { gunzipSync } from 'fflate';
import type { Episode } from '../model';

export interface BaOriginal {
  id: number;
  filename: string;
  url: string;
  bytes: number;
  sha256: string;
  path?: string;
}
export interface BaRecipe {
  version: number;
  group: number;
  episode: Episode;
  inputs: BaOriginal[];
  outputs: unknown[];
  [key: string]: unknown;
}
export interface BaDownload {
  id?: string;
  episode?: Episode;
  recipe: string;
  sha256: string;
  bytes: number;
  downloadBytes: number;
}
export const baDownloads = catalog as BaDownload[];
export const baDownloadById = new Map(
  baDownloads.map((entry) => [entry.episode?.id ?? entry.id!, entry]),
);
const recipes = import.meta.glob('./ba/recipes/*.json.gz', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
export async function loadBaRecipe(
  episode: Episode,
  signal: AbortSignal,
): Promise<BaRecipe> {
  if (episode.id === prologue.episode.id)
    return prologue as unknown as BaRecipe;
  const descriptor = baDownloadById.get(episode.id);
  if (!descriptor)
    throw Error('Download instructions are not available for this BA story.');
  const url = recipes['./ba/recipes/' + descriptor.recipe];
  if (!url)
    throw Error('Download instructions are missing. Update the app and retry.');
  const cache = await caches.open('onlystory.ba-recipes.v1');
  async function verified(response: Response) {
    if (!response.ok)
      throw Error(
        'Download instructions could not be loaded. Reopen the app online and retry.',
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    if (bytes.length !== descriptor!.bytes || sha !== descriptor!.sha256)
      throw Error(
        'BA download instructions failed verification. Update the app and retry.',
      );
    const recipe = JSON.parse(
      new TextDecoder().decode(gunzipSync(bytes)),
    ) as BaRecipe;
    if (
      recipe.version !== 2 ||
      recipe.episode.id !== episode.id ||
      recipe.episode.content?.url !== episode.content?.url ||
      recipe.episode.content?.sceneUrl !== episode.content?.sceneUrl
    )
      throw Error('Download instructions do not match this BA story.');
    return { bytes, recipe };
  }
  const cached = await cache.match(url);
  if (cached) {
    try {
      return (await verified(cached)).recipe;
    } catch {
      await cache.delete(url);
    }
  }
  signal.throwIfAborted();
  const { bytes, recipe } = await verified(await fetch(url, { signal }));
  await cache.put(url, new Response(bytes));
  return recipe;
}
