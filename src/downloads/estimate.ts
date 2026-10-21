import { gamePreferences, type Episode, type Preferences } from '../model';
import {
  canonicalMediaPath,
  matchMedia,
  MEDIA_CACHE,
  responseBytes,
  selectedSceneFiles,
} from '../media-storage';
import { isBaImport } from './providers';

export interface DownloadEstimate {
  bytes: number;
  reusedBytes: number;
  files: number;
  unknownFiles: number;
  originals: boolean;
}

/** Unique pinned input bytes, checked against this device before any transfer. */
export async function estimateDownloads(
  episodes: Episode[],
  signal: AbortSignal,
  preferences?: Preferences,
): Promise<DownloadEstimate> {
  const cache = await caches.open(MEDIA_CACHE);
  const unique = new Map<string, { bytes?: number; reused: boolean }>();
  let originals = false;
  for (const episode of episodes) {
    signal.throwIfAborted();
    if (isBaImport(episode)) {
      originals = true;
      const { loadBaRecipe } = await import('./ba-catalog');
      const { requiredBaInputs } = await import('./ba/output-cache.mjs');
      const recipe = await loadBaRecipe(episode, signal);
      const missing = new Set(
        (await requiredBaInputs(recipe)).map((input) => input.sha256),
      );
      for (const input of recipe.inputs) {
        const key = `ba-original:${input.sha256}`;
        const previous = unique.get(key);
        unique.set(key, {
          bytes: input.bytes,
          reused: (previous?.reused ?? true) && !missing.has(input.sha256),
        });
      }
    } else if (episode.acquisition) {
      const { loadPjskRecipe } = await import('./pjsk');
      const recipe = await loadPjskRecipe(episode, signal);
      for (const file of [
        recipe.scenario,
        ...recipe.media.files.filter((file) => file.sourceUrl),
        ...(recipe.extraFiles ?? []),
      ]) {
        if (unique.has(file.url)) continue;
        unique.set(file.url, {
          bytes: file.bytes,
          reused: !!(await matchMedia(cache, file.url)),
        });
      }
    } else {
      const program =
        episode.renderer?.id === 'gfl2-event'
          ? (episode.renderer.payload as {
              files?: { url: string; bytes: number }[];
            })
          : undefined;
      const sizes = new Map(
        program?.files?.map((file) => [file.url, file.bytes]),
      );
      const selectedPreferences = preferences
        ? gamePreferences(preferences, episode.game)
        : undefined;
      const selected =
        program?.files && selectedPreferences
          ? new Set(
              selectedSceneFiles(
                program as Parameters<typeof selectedSceneFiles>[0],
                selectedPreferences.voice,
                selectedPreferences.textVariant,
              ),
            )
          : undefined;
      const inventory = new Set(program?.files?.map((file) => file.url));
      for (const path of episode.assets.filter(
        (path) => !inventory.has(path) || !selected || selected.has(path),
      )) {
        const key = await canonicalMediaPath(cache, path);
        if (unique.has(key)) continue;
        const response = await matchMedia(cache, path);
        unique.set(key, {
          bytes:
            sizes.get(path) ??
            (response ? await responseBytes(response) : undefined),
          reused: !!response,
        });
      }
    }
  }
  signal.throwIfAborted();
  const estimate: DownloadEstimate = {
    bytes: 0,
    reusedBytes: 0,
    files: unique.size,
    unknownFiles: 0,
    originals,
  };
  for (const file of unique.values()) {
    if (file.bytes == null) estimate.unknownFiles++;
    else if (file.reused) estimate.reusedBytes += file.bytes;
    else estimate.bytes += file.bytes;
  }
  return estimate;
}
