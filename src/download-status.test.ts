import { expect, it } from 'vitest';
import {
  persistTransfer,
  readTransferHistory,
  restoreTransfers,
  transferFraction,
} from './download-status';
import { isInstalled, type Transfer } from './store';
import { emptyData } from './model';
import { episodes } from './fixtures';

const job: Transfer = {
  episodeId: 'test',
  status: 'downloading',
  bytes: 100,
  total: 100,
};

it('uses the full file inventory rather than the bytes of only completed files', () => {
  expect(transferFraction(job)).toBe(0);
  expect(
    transferFraction({
      ...job,
      filesDone: 2,
      filesTotal: 4,
      fileProgress: 0.5,
    }),
  ).toBe(0.625);
  expect(
    transferFraction({ ...job, fraction: 0.4, filesDone: 2, filesTotal: 4 }),
  ).toBe(0.4);
  expect(transferFraction({ ...job, status: 'complete' })).toBe(1);
});

it('retains terminal history without declaring another window’s live downloads interrupted', () => {
  const restored = restoreTransfers(
    JSON.stringify([job, { ...job, episodeId: 'done', status: 'complete' }]),
  );
  expect(restored.test).toBeUndefined();
  expect(restored.done.status).toBe('complete');
  expect(restoreTransfers('invalid')).toEqual({});
  expect(restoreTransfers('[null, {"episodeId":"bad"}]')).toEqual({});
});

it('does not call a legacy metadata-only flag an installed story', () => {
  const episode = episodes[0];
  const data = emptyData();
  data.installed[episode.id] = true;
  expect(isInstalled(data, episode)).toBe(false);
  data.installations = {
    [episode.id]: { files: ['/chapter.json'], voices: ['zh-CN', 'ja'] },
  };
  expect(isInstalled(data, episode)).toBe(true);
});

it('stores terminal attempts per story and refuses stale overwrites from another window', () => {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  persistTransfer(storage, { ...job, status: 'complete', finishedAt: 20 });
  persistTransfer(storage, { ...job, status: 'canceled', finishedAt: 10 });
  persistTransfer(storage, {
    ...job,
    episodeId: 'other',
    status: 'failed',
    finishedAt: 30,
  });
  persistTransfer(storage, { ...job, episodeId: 'live' });
  const history = readTransferHistory(storage);
  expect(history.test.status).toBe('complete');
  expect(history.other.status).toBe('failed');
  expect(history.live).toBeUndefined();
});
