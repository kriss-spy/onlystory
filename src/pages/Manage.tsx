import { memo, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Download, RotateCw, Search, Trash2, X } from 'lucide-react';
import { episodes, gameById, games } from '../content';
import { isInstalled, useStore } from '../store';
import type { Transfer } from '../store';
import { gamePreferences, type Episode, type GameId } from '../model';
import { EmptyState, formatBytes, IconButton } from '../components/Primitives';
import { PageTitle } from '../components/Shell';
import { hasOnlineSource, isBaImport } from '../downloads/providers';
import { useLocalLibrary } from '../hooks';

export function ManagePage() {
  const { data, transfers, download, cancel, remove, preferences } = useStore();
  const localLibrary = useLocalLibrary();
  const canDownload = (episode: Episode) =>
    episode.origin !== 'game' ||
    hasOnlineSource(episode) ||
    localLibrary === true;
  const [storage, setStorage] = useState<{
    bytes: number;
    quota?: number;
    usage?: number;
  }>();
  const [storageRevision, setStorageRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setStorageRevision((revision) => revision + 1);
    window.addEventListener('onlystory:storage-changed', refresh);
    return () =>
      window.removeEventListener('onlystory:storage-changed', refresh);
  }, []);
  const downloading = Object.values(transfers).some(
    (job) => job.status === 'downloading',
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const cache = await caches.open('onlystory.media.v1');
      let bytes = 0;
      for (const key of await cache.keys()) {
        const response = await cache.match(key);
        if (response)
          bytes +=
            Number(response.headers.get('content-length')) ||
            (await response.blob()).size;
      }
      const estimate = await navigator.storage?.estimate?.();
      if (active)
        setStorage({ bytes, quota: estimate?.quota, usage: estimate?.usage });
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [data.installed, downloading, storageRevision]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const game = games.some((game) => game.id === params.get('game'))
    ? (params.get('game') as GameId)
    : undefined;
  const selectedPreferences = game
    ? gamePreferences(data.preferences, game)
    : data.preferences;
  const collection = episodes.filter((e) =>
    params.get('examples') === '1'
      ? !e.origin
      : e.origin === 'game' &&
        (params.get('previews') === '1' ? e.preview : !e.preview),
  );
  const visible = collection.filter(
    (e) =>
      (params.get('source') !== 'online' || hasOnlineSource(e)) &&
      (!window.onlystoryDesktop ||
        params.get('all') === '1' ||
        hasOnlineSource(e)) &&
      (!game || e.game === game) &&
      `${e.title} ${e.story} ${gameById(e.game)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / 60));
  const currentPage = Math.min(page, pageCount);
  const pageEpisodes = visible.slice((currentPage - 1) * 60, currentPage * 60);
  const selectable = pageEpisodes.filter(
    (episode) => canDownload(episode) || isInstalled(data, episode),
  );
  const toggle = useCallback(
    (id: string) =>
      setSelected((old) =>
        old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
      ),
    [],
  );
  return (
    <main className="page manage-page">
      <PageTitle eyebrow="ON THIS DEVICE" title="Episode downloads">
        <p>
          Take the stories you want with you. Keep your reading history either
          way.
        </p>
      </PageTitle>
      <section className="online-stories" aria-label="Verified story sources">
        <Link className="acquisition-link" to="/games/ba">
          <Download size={19} />
          <span>
            <strong>Blue Archive</strong>
            <small>Browse stories to download or import</small>
          </span>
        </Link>
        <Link className="acquisition-link" to="/games/pjsk">
          <Download size={19} />
          <span>
            <strong>Project SEKAI</strong>
            <small>Browse main stories and events to download</small>
          </span>
        </Link>
      </section>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search downloads"
            placeholder="Find an episode or game…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Download game"
          value={game ?? 'all'}
          onChange={(event) => {
            setPage(1);
            const next = new URLSearchParams(params);
            if (event.target.value === 'all') next.delete('game');
            else next.set('game', event.target.value);
            setParams(next, { replace: true });
          }}
        >
          <option value="all">All games</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.shortName}
            </option>
          ))}
        </select>
        {window.onlystoryDesktop ? (
          <label className="check">
            <input
              type="checkbox"
              checked={params.get('all') === '1'}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.checked) next.set('all', '1');
                else next.delete('all');
                setParams(next, { replace: true });
              }}
            />{' '}
            Show stories awaiting a downloader
          </label>
        ) : null}
        {!game || game === 'gfl2' ? (
          <label className="check">
            {game ? 'Movie voice' : 'Default movie voice'}
            <select
              aria-label="Download voice language"
              value={selectedPreferences.voice}
              onChange={(event) => {
                const voice = event.target.value as 'zh-CN' | 'ja';
                preferences(
                  game
                    ? {
                        games: {
                          ...data.preferences.games,
                          [game]: { ...data.preferences.games?.[game], voice },
                        },
                      }
                    : { voice },
                );
              }}
            >
              <option value="zh-CN">中文</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        ) : null}
        {selected.length ? (
          <div className="button-row">
            <span>{selected.length} selected</span>
            <IconButton
              label="Download selected episodes"
              disabled={
                !episodes.some((e) => selected.includes(e.id) && canDownload(e))
              }
              onClick={() =>
                episodes
                  .filter((e) => selected.includes(e.id) && canDownload(e))
                  .forEach((episode) => download(episode))
              }
            >
              <Download size={18} />
            </IconButton>
            <IconButton
              label="Remove selected episodes"
              onClick={() => {
                remove(collection.filter((e) => selected.includes(e.id)));
                setSelected([]);
              }}
            >
              <Trash2 size={18} />
            </IconButton>
            <IconButton label="Clear selection" onClick={() => setSelected([])}>
              <X size={17} />
            </IconButton>
          </div>
        ) : null}
      </div>
      {storage ? (
        <p className="field-note">
          {formatBytes(storage.bytes)} cached media
          {storage.quota !== undefined && storage.usage !== undefined
            ? ` · ${formatBytes(Math.max(0, storage.quota - storage.usage))} estimated browser space available`
            : ''}
          . Downloads include the selected movie voice.
        </p>
      ) : null}
      {!visible.length ? (
        <EmptyState title="No matching episodes">
          Try another title or game.
        </EmptyState>
      ) : (
        <div className="download-list">
          <div className="download-list-heading">
            <label className="check">
              <input
                type="checkbox"
                aria-label="Select all visible episodes"
                disabled={!selectable.length}
                checked={
                  selectable.length > 0 &&
                  selectable.every((e) => selected.includes(e.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...selectable.map((e) => e.id),
                          ]),
                        ]
                      : selected.filter(
                          (id) => !pageEpisodes.some((e) => e.id === id),
                        ),
                  )
                }
              />
              Select visible
            </label>
            <span className="field-note">
              Downloads continue while you read.
            </span>
          </div>
          {pageEpisodes.map((episode) => (
            <DownloadItem
              key={episode.id}
              episode={episode}
              job={transfers[episode.id]}
              installed={isInstalled(data, episode)}
              canDownload={canDownload(episode)}
              selected={selected.includes(episode.id)}
              toggle={toggle}
              download={download}
              cancel={cancel}
              remove={remove}
            />
          ))}
        </div>
      )}
      {pageCount > 1 ? (
        <nav className="button-row" aria-label="Download pages">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            {currentPage} / {pageCount} · {visible.length} episodes
          </span>
          <button
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
      <p className="page-note">
        Removing a story keeps its progress and bookmarks. Undo is available for
        30 seconds; unused playback media are then reclaimed. Media needed by
        other stories and native original-file caches are kept.
      </p>
    </main>
  );
}

type DownloadItemProps = Pick<
  ReturnType<typeof useStore>,
  'download' | 'cancel' | 'remove'
> & {
  episode: Episode;
  job?: Transfer;
  installed: boolean;
  canDownload: boolean;
  selected: boolean;
  toggle: (id: string) => void;
};
const DownloadItem = memo(function DownloadItem({
  episode,
  job,
  installed,
  canDownload,
  selected,
  toggle,
  download,
  cancel,
  remove,
}: DownloadItemProps) {
  const busy = job?.status === 'downloading';
  return (
    <article className="download-item">
      <input
        aria-label={`Select ${gameById(episode.game)?.shortName} ${episode.title}`}
        type="checkbox"
        checked={selected}
        disabled={!installed && !canDownload}
        onChange={() => toggle(episode.id)}
      />
      <div className="download-details">
        <small>
          {gameById(episode.game)?.shortName} · {episode.story}
        </small>
        <Link to={`/read/${episode.game}/${episode.id}`}>{episode.title}</Link>
        <div className="download-status">
          {busy ? (
            <>
              <span>
                {job.message || 'Downloading'} · {formatBytes(job.bytes)}
                {job.filesTotal
                  ? ` · ${job.filesDone ?? 0} / ${job.filesTotal} files`
                  : ' · Preparing files'}
              </span>
              <progress
                aria-label={`Downloading ${episode.title}`}
                max={job.filesTotal || 1}
                value={
                  job.filesTotal
                    ? Math.min(
                        (job.filesDone ?? 0) + (job.fileProgress ?? 0),
                        job.filesTotal,
                      )
                    : undefined
                }
              />
            </>
          ) : job?.status === 'failed' ? (
            <span className="error-text" role="alert">
              {job.error}
            </span>
          ) : job?.status === 'canceled' && !installed ? (
            <span>Download canceled. Your progress is unchanged.</span>
          ) : installed ? (
            <span>
              <Check size={12} />
              On this device ·{' '}
              {episode.origin === 'game'
                ? episode.game === 'gfl1'
                  ? 'English text, original images and available music'
                  : episode.readingMode === 'text'
                    ? episode.textLocales?.includes('ja')
                      ? 'Japanese text and preserved source scripts'
                      : '简中原文与保留的剧本'
                    : episode.game === 'ba'
                      ? 'Japanese text, animated characters, CGs and audio'
                      : '简中原文、CG、音乐与音效'
                : 'EN text, 简中 text, EN sample voice'}
            </span>
          ) : (
            <span>
              {!canDownload
                ? 'Downloader not available yet'
                : isBaImport(episode) && !window.onlystoryDesktop
                  ? 'Import original files for offline reading'
                  : episode.availability === 'incomplete'
                    ? 'Partial archive · missing scene is disclosed in the reader'
                    : 'Available to download'}
            </span>
          )}
        </div>
      </div>
      {busy ? (
        <IconButton
          label={`Cancel download ${episode.title}`}
          onClick={() => cancel(episode.id)}
        >
          <X size={18} />
        </IconButton>
      ) : installed ? (
        <IconButton
          label={`Remove download ${episode.title}`}
          onClick={() => remove(episode)}
        >
          <Trash2 size={18} />
        </IconButton>
      ) : (
        <IconButton
          disabled={!canDownload}
          label={`${job?.status === 'failed' ? 'Retry download' : 'Download'} ${episode.title}`}
          onClick={() => download(episode)}
        >
          {job?.status === 'failed' ? (
            <RotateCw size={18} />
          ) : (
            <Download size={18} />
          )}
        </IconButton>
      )}
    </article>
  );
});
