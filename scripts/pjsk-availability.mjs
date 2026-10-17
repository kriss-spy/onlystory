import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, safeAssetPath } from './pjsk-scenario.mjs';
import { writeJson } from './pjsk-import.mjs';
import { parseVoiceListing } from './pjsk-voice-listing.mjs';

export function classifyEventAvailability(
  event,
  records,
  scenarioProofs,
  listing,
) {
  if (!event.episodes.length) return 'failed';
  const rows = event.episodes.map((episode) =>
    records.find(
      (record) =>
        record.id === episode.id && record.scenarioId === episode.scenarioId,
    ),
  );
  if (rows.every((row) => row?.status === 'acquired')) return 'available';
  // A missing chapter in a partly available event is always an acquisition error.
  if (rows.some((row) => row?.status === 'acquired')) return 'failed';
  if (
    !rows.every(
      (row) =>
        row?.status === 'failed' &&
        /^(HTTP 404 for |Source is not cached for offline import: )/.test(
          row.error ?? '',
        ),
    )
  )
    return 'failed';
  if (
    !event.episodes.every(
      (episode) => scenarioProofs.get(episode.id)?.status === 404,
    )
  )
    return 'failed';
  return listing && listing.keys.length === 0
    ? 'cn-scenarios-unavailable'
    : 'failed';
}

export async function buildPjskAvailability({
  manifest,
  acquisition,
  cacheDir,
  reportDir,
  offline = false,
  fetcher = fetch,
  now = () => new Date().toISOString(),
}) {
  await mkdir(cacheDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  const acquisitionSha256 = sha256(JSON.stringify(acquisition));
  let nextRequestAt = 0,
    cooldownUntil = 0;
  const sleep = (ms) =>
    new Promise((done) => setTimeout(done, Math.max(0, ms)));
  async function requestSlot() {
    while (true) {
      const due = Math.max(Date.now(), nextRequestAt, cooldownUntil);
      nextRequestAt = due + 125;
      await sleep(due - Date.now());
      if (Date.now() >= cooldownUntil) return;
    }
  }
  async function response(url) {
    const indexPath = resolve(cacheDir, `${sha256(url)}.json`);
    let cached;
    try {
      cached = JSON.parse(await readFile(indexPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (cached && offline) {
      if (
        cached.url !== url ||
        !/^[a-f0-9]{64}$/.test(cached.sha256) ||
        ![200, 404].includes(cached.status)
      )
        throw new Error(`Invalid availability cache identity: ${url}`);
      const bytes = await readFile(resolve(cacheDir, `${cached.sha256}.bin`));
      if (bytes.length !== cached.bytes || sha256(bytes) !== cached.sha256)
        throw new Error(`Availability cache checksum mismatch: ${url}`);
      return { ...cached, data: bytes };
    }
    if (offline) throw new Error(`Availability evidence is not cached: ${url}`);
    for (let attempt = 0; attempt < 4; attempt++) {
      await requestSlot();
      try {
        const result = await fetcher(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        if (result.status === 429) {
          const retry = result.headers.get('retry-after');
          const delay = /^\d+$/.test(retry ?? '')
            ? Number(retry) * 1000
            : Date.parse(retry ?? '') - Date.now();
          cooldownUntil = Math.max(
            cooldownUntil,
            Date.now() +
              Math.max(Number.isFinite(delay) ? delay : 0, 5000 * 2 ** attempt),
          );
          throw new Error('Availability HTTP 429');
        }
        if (![200, 404].includes(result.status))
          throw new Error(`Availability HTTP ${result.status}: ${url}`);
        const data = Buffer.from(await result.arrayBuffer());
        if (url.includes('?list-type=2')) {
          if (result.status !== 200)
            throw new Error(`Directory evidence HTTP ${result.status}: ${url}`);
          parseVoiceListing(data.toString('utf8'));
        }
        const record = {
          url,
          status: result.status,
          sha256: sha256(data),
          bytes: data.length,
          fetchedAt: now(),
          cacheFile: `${sha256(data)}.bin`,
        };
        await writeFile(resolve(cacheDir, record.cacheFile), data);
        await writeJson(indexPath, record);
        return { ...record, data };
      } catch (error) {
        if (
          attempt === 3 ||
          /Invalid original voice listing|Truncated original voice listing/.test(
            error.message,
          )
        )
          throw error;
        await sleep(250 * 2 ** attempt);
      }
    }
  }
  const report = {
    checkedAt: now(),
    acquisitionSha256,
    cacheDirectory: resolve(cacheDir),
    availableEpisodes: 0,
    unavailableEpisodes: 0,
    unavailableEvents: 0,
    failedEpisodes: 0,
    events: [],
    failures: [],
  };
  const tasks = [...manifest.events];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (tasks.length) {
        const event = tasks.shift();
        const records = acquisition.episodes.filter(
          (row) => String(row.eventId) === String(event.eventId),
        );
        if (
          classifyEventAvailability(event, records, new Map(), null) ===
          'available'
        ) {
          report.availableEpisodes += event.episodes.length;
          continue;
        }
        const rows = event.episodes.map((episode) =>
          records.find(
            (row) =>
              row.id === episode.id && row.scenarioId === episode.scenarioId,
          ),
        );
        const eligible = rows.every(
          (row) =>
            row?.status === 'failed' &&
            /^(HTTP 404 for |Source is not cached for offline import: )/.test(
              row.error ?? '',
            ),
        );
        if (!eligible) {
          report.availableEpisodes += rows.filter(
            (row) => row?.status === 'acquired',
          ).length;
          report.failedEpisodes += rows.filter(
            (row) => row?.status !== 'acquired',
          ).length;
          report.failures.push({
            eventId: event.eventId,
            error:
              'Partially available event or acquisition failure other than a source 404',
          });
          continue;
        }
        try {
          const proofs = new Map();
          for (const episode of event.episodes) {
            const url = `https://storage.sekai.best/sekai-cn-assets/${safeAssetPath(episode.path)}`;
            // The failed row must refer to this exact canonical metadata path.
            const row = rows.find((record) => record.id === episode.id);
            if (!row.error.endsWith(url))
              throw new Error(
                'Failed source URL does not match canonical episode metadata',
              );
            const { data, ...proof } = await response(url);
            proofs.set(episode.id, proof);
          }
          const directory = `event_story/${safeAssetPath(event.bundle)}/scenario/`;
          const keys = [],
            listingSources = [];
          let continuation = '';
          const seen = new Set();
          do {
            const url = `https://storage.sekai.best/sekai-cn-assets/?list-type=2&prefix=${encodeURIComponent(directory)}${continuation ? `&continuation-token=${encodeURIComponent(continuation)}` : ''}`;
            const { data, ...source } = await response(url);
            const page = parseVoiceListing(data.toString('utf8'));
            for (const entry of page.entries) {
              if (!entry.key.startsWith(directory) || entry.key.includes('..'))
                throw new Error('Unexpected CN directory listing path');
              keys.push(entry.key);
            }
            listingSources.push(source);
            continuation = page.continuation;
            if (continuation && seen.has(continuation))
              throw new Error('Repeated CN listing continuation token');
            seen.add(continuation);
          } while (continuation);
          const status = classifyEventAvailability(event, records, proofs, {
            keys,
          });
          if (status !== 'cn-scenarios-unavailable')
            throw new Error(
              'All canonical source 404s and an empty original CN directory were not both proved',
            );
          report.unavailableEpisodes += event.episodes.length;
          report.unavailableEvents++;
          report.events.push({
            eventId: event.eventId,
            name: event.name,
            startAt: event.startAt,
            releaseDate: new Date(event.startAt + 8 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            episodeCount: event.episodes.length,
            status,
            source: listingSources[0],
            listingSources,
            scenarioSources: [...proofs.values()],
            keys,
          });
        } catch (error) {
          report.failedEpisodes += event.episodes.length;
          report.failures.push({
            eventId: event.eventId,
            error: error.message,
          });
        }
      }
    }),
  );
  report.events.sort((a, b) => Number(a.eventId) - Number(b.eventId));
  report.failures.sort((a, b) => Number(a.eventId) - Number(b.eventId));
  await writeJson(resolve(reportDir, 'availability.json'), report);
  return report;
}
