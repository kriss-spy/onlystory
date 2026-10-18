import { memo, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Download, RotateCw, Search, Trash2, X } from 'lucide-react';
import { episodes, gameById } from '../content';
import { isInstalled, useStore } from '../store';
import type { Transfer } from '../store';
import type { Episode } from '../model';
import { EmptyState, formatBytes, IconButton } from '../components/Primitives';
import { PageTitle } from '../components/Shell';

export function ManagePage() {
  const { data, transfers, download, cancel, remove, preferences } = useStore();
  const [storage, setStorage] = useState<{
    bytes: number;
    quota?: number;
    usage?: number;
  }>();
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
  }, [data.installed, downloading]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [params] = useSearchParams();
  const collection = episodes.filter((e) =>
    params.get('examples') === '1'
      ? !e.origin
      : e.origin === 'game' &&
        (params.get('previews') === '1' ? e.preview : !e.preview),
  );
  const visible = collection.filter((e) =>
    `${e.title} ${gameById(e.game)?.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
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
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search downloads"
            placeholder="Find an episode or game…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="check">
          Voice language
          <select
            aria-label="Download voice language"
            value={data.preferences.voice}
            onChange={(event) =>
              preferences({ voice: event.target.value as 'zh-CN' | 'ja' })
            }
          >
            <option value="zh-CN">中文</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        {selected.length ? (
          <div className="button-row">
            <span>{selected.length} selected</span>
            <IconButton
              label="Download selected episodes"
              onClick={() =>
                episodes
                  .filter((e) => selected.includes(e.id))
                  .forEach(download)
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
                checked={
                  visible.length > 0 &&
                  visible.every((e) => selected.includes(e.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...new Set([...selected, ...visible.map((e) => e.id)])]
                      : selected.filter(
                          (id) => !visible.some((e) => e.id === id),
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
          {visible.map((episode) => (
            <DownloadItem
              key={episode.id}
              episode={episode}
              job={transfers[episode.id]}
              installed={isInstalled(data, episode)}
              selected={selected.includes(episode.id)}
              toggle={toggle}
              download={download}
              cancel={cancel}
              remove={remove}
            />
          ))}
        </div>
      )}
      <p className="page-note">
        Episodes can share media. Removing an episode keeps its progress,
        bookmarks and shared media cache. Desktop disk storage is a later
        integration.
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
  selected: boolean;
  toggle: (id: string) => void;
};
const DownloadItem = memo(function DownloadItem({
  episode,
  job,
  installed,
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
              <span>Downloading · {formatBytes(job.bytes)}</span>
              <progress aria-label={`Downloading ${episode.title}`} max={1} />
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
              {episode.availability === 'incomplete'
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
