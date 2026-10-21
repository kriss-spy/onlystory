import type { Transfer } from './store';

export const HISTORY_KEY = 'onlystory.download-history.v1';

export function transferFraction(transfer: Transfer) {
  if (transfer.status === 'complete') return 1;
  const fraction =
    transfer.fraction ??
    (transfer.filesTotal
      ? ((transfer.filesDone ?? 0) + (transfer.fileProgress ?? 0)) /
        transfer.filesTotal
      : 0);
  return Math.max(0, Math.min(0.99, fraction));
}

export function restoreTransfers(raw: string | null): Record<string, Transfer> {
  try {
    const values: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(values)) return {};
    return Object.fromEntries(
      values
        .filter(
          (value): value is Transfer =>
            !!value &&
            typeof value.episodeId === 'string' &&
            ['complete', 'failed', 'canceled'].includes(value.status) &&
            Number.isFinite(value.bytes) &&
            Number.isFinite(value.total),
        )
        .slice(-500)
        .map((value) => [value.episodeId, value]),
    );
  } catch {
    return {};
  }
}

export function readTransferHistory(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
) {
  const jobs = restoreTransfers(storage.getItem(HISTORY_KEY));
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(`${HISTORY_KEY}:`)) continue;
    for (const [id, job] of Object.entries(
      restoreTransfers(storage.getItem(key)),
    )) {
      if ((job.finishedAt ?? 0) >= (jobs[id]?.finishedAt ?? 0)) jobs[id] = job;
    }
  }
  return jobs;
}

export function persistTransfer(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  job: Transfer,
) {
  if (job.status === 'downloading') return;
  const key = `${HISTORY_KEY}:${encodeURIComponent(job.episodeId)}`;
  const previous = restoreTransfers(storage.getItem(key))[job.episodeId];
  if (previous && (previous.finishedAt ?? 0) >= (job.finishedAt ?? 0)) return;
  storage.setItem(key, JSON.stringify([job]));
}
