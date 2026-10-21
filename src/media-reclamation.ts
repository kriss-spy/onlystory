import type { AppData } from './model';
import { installationFiles } from './downloads/pjsk-inventory';
import {
  canonicalMediaPath,
  MEDIA_CACHE,
  responseBytes,
} from './media-storage';
import { withMediaLock } from './media-lock';

export const REMOVAL_RETENTION_MS = 30_000;
const prefix = '/__onlystory/removals/';
interface Removal {
  version: 1;
  expires: number;
  files: string[];
}
export interface ReclamationReport {
  files: string[];
  bytes: number;
  blocked: boolean;
  nextExpiry?: number;
}

/** Undo preserves installs completed since removal and restores the old languages. */
export function restoreRemovedInstallations(
  current: AppData,
  snapshot: AppData,
  ids: string[],
): AppData {
  const installed = { ...current.installed },
    installations = { ...current.installations };
  for (const id of ids) {
    if (!snapshot.installed[id]) continue;
    installed[id] = true;
    const original = snapshot.installations?.[id];
    const newer = current.installed[id]
      ? current.installations?.[id]
      : undefined;
    if (original)
      installations[id] = {
        files: [...new Set([...original.files, ...(newer?.files ?? [])])],
        voices: [...new Set([...original.voices, ...(newer?.voices ?? [])])],
        ...(original.variants && (!newer || newer.variants)
          ? {
              variants: [
                ...new Set([...original.variants, ...(newer?.variants ?? [])]),
              ],
            }
          : {}),
      };
  }
  return { ...current, installed, installations };
}

/** Persist the candidate inventory before starting the Undo clock. */
export async function retainRemovedMedia(
  cache: Cache,
  data: AppData,
  ids: string[],
  now = Date.now(),
) {
  const files = new Set<string>();
  for (const id of ids) {
    const installation = data.installations?.[id];
    if (!data.installed[id] || !installation) continue;
    for (const url of await installationFiles(cache, id, installation.files))
      files.add(url);
  }
  const key = `${prefix}${crypto.randomUUID()}.json`;
  await cache.put(
    key,
    new Response(
      JSON.stringify({
        version: 1,
        expires: now + REMOVAL_RETENTION_MS,
        files: [...files],
      } satisfies Removal),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    ),
  );
  return key;
}

/** Only a removal journal authorizes reclamation. Unlisted cached files survive. */
export async function reclaimRemovedMedia(
  readData: () => AppData,
  { dryRun = true, now = Date.now() } = {},
): Promise<ReclamationReport> {
  return withMediaLock('onlystory:media-library', undefined, async () => {
    const cache = await caches.open(MEDIA_CACHE);
    const journals = (await cache.keys()).filter((key) =>
      new URL(key.url).pathname.startsWith(prefix),
    );
    if (!journals.length) return { files: [], bytes: 0, blocked: false };
    const data = readData();
    const retained = new Set<string>();
    let blocked = false;
    for (const [id, installed] of Object.entries(data.installed)) {
      if (!installed) continue;
      const installation = data.installations?.[id];
      // A pre-inventory installation or missing nested inventory cannot prove
      // that an object is unreferenced. Retry after repair/removal of that item.
      if (!installation) {
        blocked = true;
        continue;
      }
      try {
        for (const url of await installationFiles(
          cache,
          id,
          installation.files,
        )) {
          if (url.includes('/installations/') && !(await cache.match(url)))
            blocked = true;
          retained.add(await canonicalMediaPath(cache, url));
        }
      } catch {
        blocked = true;
      }
    }
    const expired: { key: Request; removal: Removal }[] = [];
    const candidates = new Set<string>();
    let nextExpiry: number | undefined;
    for (const key of journals) {
      try {
        const removal = (await (await cache.match(key))?.json()) as Removal;
        if (
          removal?.version !== 1 ||
          !Array.isArray(removal.files) ||
          !Number.isFinite(removal.expires)
        ) {
          blocked = true;
          continue;
        }
        if (removal.expires > now) {
          nextExpiry = Math.min(nextExpiry ?? Infinity, removal.expires);
          for (const url of removal.files)
            retained.add(await canonicalMediaPath(cache, url));
        } else expired.push({ key, removal });
      } catch {
        blocked = true;
      }
    }
    for (const { removal } of expired)
      for (const url of removal.files) {
        // Shell resources, covers and demo previews are outside removal's scope.
        if (
          typeof url !== 'string' ||
          !url.startsWith('/private/') ||
          /\/(covers|previews?)\//.test(url)
        )
          continue;
        const canonical = await canonicalMediaPath(cache, url);
        if (!retained.has(canonical)) {
          candidates.add(url);
          candidates.add(canonical);
        }
      }
    const report: ReclamationReport = {
      files: [],
      bytes: 0,
      blocked,
      nextExpiry,
    };
    if (blocked) return report;
    for (const url of candidates) {
      const response = await cache.match(url);
      if (!response) continue;
      report.files.push(url);
      report.bytes += await responseBytes(response);
    }
    if (!dryRun) {
      // Delete the journal last. An interrupted pass repeats safely on startup.
      for (const url of report.files) await cache.delete(url);
      for (const { key } of expired) await cache.delete(key);
    }
    return report;
  });
}
