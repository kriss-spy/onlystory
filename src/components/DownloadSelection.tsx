import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleOff, Clock3, Download, History, X } from 'lucide-react';
import { episodeById, eventForEpisode } from '../content';
import { collectionTitle, episodeTitle } from '../localized-titles';
import { gamePreferences } from '../model';
import { transferFraction } from '../download-status';
import { useI18n } from '../i18n';
import type { Episode } from '../model';
import { isInstalled, useStore } from '../store';
import {
  hasOnlineSource,
  isBaImport,
  needsFurtherReverseEngineering,
} from '../downloads/providers';
import { formatBytes, IconButton, Panel } from './Primitives';
import {
  estimateDownloads,
  type DownloadEstimate,
} from '../downloads/estimate';

const Context = createContext<{
  selecting: boolean;
  selected: Set<string>;
  eligible: (episode: Episode) => boolean;
  toggle: (episodes: Episode[]) => void;
  press: () => void;
  close: () => void;
  estimate?: DownloadEstimate;
  estimating?: boolean;
}>({
  selecting: false,
  selected: new Set(),
  eligible: () => false,
  toggle: () => {},
  press: () => {},
  close: () => {},
});

export const useDownloadSelection = () => useContext(Context);

export function DownloadSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { data, transfers, download } = useStore();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, Episode>>(new Map());
  const [estimate, setEstimate] = useState<DownloadEstimate>();
  const [estimating, setEstimating] = useState(false);
  const originalFolder = useRef<HTMLInputElement>(null);
  const pendingImports = useRef<Episode[]>([]);
  const eligible = (episode: Episode) =>
    hasOnlineSource(episode) &&
    !isInstalled(data, episode) &&
    transfers[episode.id]?.status !== 'downloading';
  const close = () => {
    setSelecting(false);
    setSelected(new Map());
  };
  useEffect(() => {
    if (!selecting || !selected.size) {
      setEstimate(undefined);
      setEstimating(false);
      return;
    }
    const controller = new AbortController();
    setEstimating(true);
    void estimateDownloads(
      [...selected.values()],
      controller.signal,
      data.preferences,
    )
      .then((value) => {
        if (!controller.signal.aborted) setEstimate(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setEstimating(false);
      });
    return () => controller.abort();
  }, [selecting, selected, data.installed, data.preferences]);
  useEffect(() => {
    if (!selecting) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !document.querySelector('[role="dialog"]')
      ) {
        setSelecting(false);
        setSelected(new Map());
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [selecting]);
  return (
    <Context.Provider
      value={{
        selecting,
        selected: new Set(selected.keys()),
        eligible,
        close,
        estimate,
        estimating,
        toggle: (episodes) => {
          const available = episodes.filter(eligible);
          setSelected((previous) => {
            const next = new Map(previous);
            const remove = available.every((episode) => next.has(episode.id));
            for (const episode of available) {
              if (remove) next.delete(episode.id);
              else next.set(episode.id, episode);
            }
            return next;
          });
        },
        press: () => {
          if (!selecting) {
            setSelecting(true);
            return;
          }
          const episodes = [...selected.values()].filter(eligible);
          if (!episodes.length) return;
          const imports = window.onlystoryDesktop
            ? []
            : episodes.filter(isBaImport);
          if (imports.length) {
            pendingImports.current = episodes;
            originalFolder.current?.click();
            return;
          }
          close();
          for (const episode of episodes) download(episode);
        },
      }}
    >
      {children}
      <input
        ref={(input) => {
          originalFolder.current = input;
          input?.setAttribute('webkitdirectory', '');
        }}
        className="sr-only"
        type="file"
        multiple
        tabIndex={-1}
        aria-label={t('Choose original folder for selected BA stories')}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (!files.length) return;
          const episodes = pendingImports.current.filter(eligible);
          pendingImports.current = [];
          close();
          for (const episode of episodes)
            download(episode, isBaImport(episode) ? files : undefined);
          event.target.value = '';
        }}
      />
    </Context.Provider>
  );
}

export function DownloadSelectionButton() {
  const selection = useDownloadSelection();
  const { t } = useI18n();
  const { transfers, cancel } = useStore();
  const [queueOpen, setQueueOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const trigger = useRef<HTMLElement | null>(null);
  const stopHover = () => clearTimeout(hoverTimer.current);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const active = Object.values(transfers).filter(
    (t) => t.status === 'downloading',
  );
  const busy = active.length > 0;
  // Include completed transfers in the current batch so finishing a story cannot reset the ring.
  const [batch, setBatch] = useState<string[]>([]);
  useEffect(() => {
    if (!active.length) return;
    setBatch((previous) => {
      const continuing = previous.some(
        (id) => transfers[id]?.status === 'downloading',
      );
      const next = new Set(continuing ? previous : []);
      for (const transfer of active) next.add(transfer.episodeId);
      return next.size === previous.length &&
        previous.every((id) => next.has(id))
        ? previous
        : [...next];
    });
  }, [transfers]);
  const tasks = [...new Set([...batch, ...active.map((t) => t.episodeId)])]
    .map((id) => transfers[id])
    .filter(Boolean);
  const fraction = tasks.length
    ? tasks.reduce((sum, job) => sum + transferFraction(job), 0) / tasks.length
    : 0;
  const percent = Math.round(fraction * 100);
  const label = selection.selecting
    ? t('Download selected stories ({count})', {
        count: selection.selected.size,
      })
    : busy
      ? t('Downloading {count} stories · {percent}%', {
          count: active.length,
          percent,
        })
      : t('Select stories to download');
  return (
    <>
      <IconButton
        label={label}
        className="download-nav"
        aria-pressed={selection.selecting}
        aria-busy={busy}
        aria-haspopup="dialog"
        aria-expanded={queueOpen}
        onMouseEnter={() => {
          if (!busy && !selection.selecting)
            hoverTimer.current = setTimeout(() => setQueueOpen(true), 900);
        }}
        onMouseLeave={stopHover}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            trigger.current = event.currentTarget;
            setQueueOpen(true);
          }
        }}
        onClick={(event) => {
          stopHover();
          trigger.current = event.currentTarget;
          if (busy && !selection.selecting) setQueueOpen(true);
          else selection.press();
        }}
      >
        <Download size={18} />
        {busy ? (
          <svg
            className="download-progress-ring"
            viewBox="0 0 36 36"
            role="progressbar"
            aria-label={t('Download progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <circle
              className="download-progress-track"
              cx="18"
              cy="18"
              r="16"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              pathLength="100"
              strokeDasharray={`${percent} 100`}
            />
          </svg>
        ) : selection.selecting && selection.selected.size ? (
          <span className="nav-count">{selection.selected.size}</span>
        ) : null}
      </IconButton>
      {!selection.selecting ? (
        <IconButton
          label={t('Download history')}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setQueueOpen(true);
          }}
        >
          <History size={16} />
        </IconButton>
      ) : null}
      <DownloadQueue
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        returnFocus={trigger.current}
      />
      {selection.selecting ? (
        <IconButton
          label={t('Cancel download selection')}
          onClick={selection.close}
        >
          <X size={16} />
        </IconButton>
      ) : busy ? (
        <IconButton
          label={t('Cancel downloads')}
          onClick={() => active.forEach((job) => cancel(job.episodeId))}
        >
          <X size={16} />
        </IconButton>
      ) : null}
      {selection.selecting && selection.selected.size > 0 ? (
        <small
          className="download-selection-size"
          role="status"
          title={
            selection.estimate?.originals
              ? t(
                  'Original input bytes needed after shared output reuse. Native source-file caches may reduce these further. Converted storage size can differ.',
                )
              : t(
                  'Unique source bytes missing from this device. Shared files count once. Download integrity is checked during installation.',
                )
          }
        >
          {selection.estimate
            ? t('{value0}{value1} new{value2}{value3}', {
                value0: selection.estimate.originals ? t('Up to ') : '',
                value1: formatBytes(selection.estimate.bytes),
                value2: selection.estimate.reusedBytes
                  ? t(' · {bytes} reused', {
                      bytes: formatBytes(selection.estimate.reusedBytes),
                    })
                  : '',
                value3: selection.estimate.unknownFiles
                  ? t(' + unmeasured files')
                  : '',
              })
            : selection.estimating
              ? t('Checking size…')
              : t('Size unavailable')}
          {selection.estimating && selection.estimate ? (
            <span className="sr-only">{t('Updating size estimate')}</span>
          ) : null}
        </small>
      ) : null}
      <span className="sr-only" role="status">
        {selection.selecting
          ? t(
              '{value0} stories selected. Press the download button to start.',
              { value0: selection.selected.size },
            )
          : busy
            ? label
            : ''}
      </span>
    </>
  );
}

function DownloadQueue({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const { t } = useI18n();
  const { data, transfers, cancel } = useStore();
  const selection = useDownloadSelection();
  const groups = new Map<
    string,
    { title: string; jobs: (typeof transfers)[string][] }
  >();
  for (const job of Object.values(transfers).reverse()) {
    const episode = episodeById(job.episodeId);
    const event = episode && eventForEpisode(episode);
    const key = event ? `${event.game}:${event.id}` : 'other';
    const locale = episode
      ? gamePreferences(data.preferences, episode.game).catalogLocale
      : data.preferences.catalogLocale;
    if (!groups.has(key))
      groups.set(key, {
        title: event ? collectionTitle(event, locale) : t('Other stories'),
        jobs: [],
      });
    groups.get(key)!.jobs.push(job);
  }
  return (
    <Panel
      open={open}
      onClose={onClose}
      title={t('Downloads')}
      description={t(
        'Downloads run while the app is open. History records the latest attempt for each story on this device.',
      )}
      returnFocus={returnFocus}
    >
      <button
        className="primary-button"
        onClick={() => {
          onClose();
          if (!selection.selecting) selection.press();
        }}
      >
        {t('Add stories to download')}
      </button>
      {!groups.size ? (
        <p>
          {t(
            'No downloads yet. Select stories with the download button to begin.',
          )}
        </p>
      ) : null}
      <div className="download-queue">
        {[...groups].map(([key, group]) => (
          <details key={key} open>
            <summary>
              {group.title}
              <small>
                {t('{count} stories', { count: group.jobs.length })}
              </small>
            </summary>
            <ul>
              {group.jobs.map((job) => {
                const episode = episodeById(job.episodeId);
                const percent = Math.round(transferFraction(job) * 100);
                const title = episode
                  ? episodeTitle(
                      episode,
                      gamePreferences(data.preferences, episode.game)
                        .catalogLocale,
                    )
                  : job.episodeId;
                const status =
                  job.status === 'complete'
                    ? t('Downloaded')
                    : job.status === 'failed'
                      ? t('Failed')
                      : job.status === 'canceled'
                        ? t('Canceled')
                        : t('Downloading');
                return (
                  <li key={job.episodeId}>
                    <strong>{title}</strong>
                    <div className="download-queue-status">
                      <span>
                        {status}
                        {job.status === 'downloading'
                          ? t(' · {value0}%', { value0: percent })
                          : ''}
                      </span>
                      {job.status === 'downloading' ? (
                        <IconButton
                          label={t('Cancel download')}
                          onClick={() => cancel(job.episodeId)}
                        >
                          <X size={14} />
                        </IconButton>
                      ) : null}
                    </div>
                    <progress
                      aria-label={t('Download progress for {title}', { title })}
                      max={1}
                      value={transferFraction(job)}
                    />
                    {job.message ? <small>{t(job.message)}</small> : null}
                    {job.error && job.status === 'failed' ? (
                      <p className="error-text">{job.error}</p>
                    ) : null}
                    {job.status === 'complete' &&
                    episode &&
                    !isInstalled(data, episode) ? (
                      <small>
                        {t(
                          'Files removed or unavailable for the current voice settings.',
                        )}
                      </small>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </Panel>
  );
}

export function DownloadCheckbox({
  episodes,
  label,
}: {
  episodes: Episode[];
  label: string;
}) {
  const { selecting, selected, eligible, toggle } = useDownloadSelection();
  if (!selecting) return null;
  const available = episodes.filter(eligible);
  const count = available.filter((episode) => selected.has(episode.id)).length;
  return (
    <input
      className="download-selection-checkbox"
      type="checkbox"
      aria-label={label}
      disabled={!available.length}
      checked={!!available.length && count === available.length}
      ref={(node) => {
        if (node) node.indeterminate = count > 0 && count < available.length;
      }}
      onChange={() => toggle(episodes)}
    />
  );
}

export function DownloadSupportNotice({ episodes }: { episodes: Episode[] }) {
  const { t } = useI18n();
  const { selecting } = useDownloadSelection();
  if (!selecting) return null;
  const unsupported = episodes.filter(
    (episode) => !hasOnlineSource(episode),
  ).length;
  if (!unsupported) return null;
  const needsResearch = episodes.filter(needsFurtherReverseEngineering).length;
  return (
    <span
      className="download-unsupported"
      data-all-unsupported={unsupported === episodes.length}
      title={
        needsResearch
          ? t(
              'Downloading these stories needs further reverse engineering of the original sources.',
            )
          : t(
              'Original sources still need verification or a downloader implementation.',
            )
      }
    >
      {needsResearch ? (
        <CircleOff size={13} aria-hidden="true" />
      ) : (
        <Clock3 size={13} aria-hidden="true" />
      )}
      {needsResearch
        ? needsResearch === episodes.length
          ? t('Unsupported')
          : t('{value0} unsupported', { value0: needsResearch })
        : t('Downloader pending')}
    </span>
  );
}
