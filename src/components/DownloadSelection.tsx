import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleOff, Clock3, Download, X } from 'lucide-react';
import type { Episode } from '../model';
import { isInstalled, useStore } from '../store';
import {
  hasOnlineSource,
  isBaImport,
  needsFurtherReverseEngineering,
} from '../downloads/providers';
import { formatBytes, IconButton } from './Primitives';
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
    setEstimate(undefined);
    if (!selecting || !selected.size) {
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
        aria-label="Choose original folder for selected BA stories"
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
  const { transfers, cancel } = useStore();
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
    ? tasks.reduce(
        (sum, t) =>
          sum +
          (t.status === 'complete'
            ? 1
            : t.fraction != null
              ? Math.min(0.99, t.fraction)
              : t.total > 0
                ? Math.min(0.99, t.bytes / t.total)
                : 0),
        0,
      ) / tasks.length
    : 0;
  const percent = Math.round(fraction * 100);
  const label = busy
    ? `Downloading ${active.length} stories · ${percent}%`
    : selection.selecting
      ? `Download selected stories (${selection.selected.size})`
      : 'Select stories to download';
  return (
    <>
      <IconButton
        label={label}
        className="download-nav"
        aria-pressed={selection.selecting}
        aria-busy={busy}
        disabled={busy}
        onClick={selection.press}
      >
        <Download size={18} />
        {busy ? (
          <svg
            className="download-progress-ring"
            viewBox="0 0 36 36"
            role="progressbar"
            aria-label="Download progress"
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
      {busy ? (
        <IconButton
          label="Cancel downloads"
          onClick={() => active.forEach((t) => cancel(t.episodeId))}
        >
          <X size={16} />
        </IconButton>
      ) : selection.selecting ? (
        <IconButton label="Cancel download selection" onClick={selection.close}>
          <X size={16} />
        </IconButton>
      ) : null}
      {selection.selecting && selection.selected.size > 0 ? (
        <small
          className="download-selection-size"
          role="status"
          title={
            selection.estimate?.originals
              ? 'Original input bytes needed after shared output reuse. Native source-file caches may reduce these further. Converted storage size can differ.'
              : 'Unique source bytes missing from this device. Shared files count once. Download integrity is checked during installation.'
          }
        >
          {selection.estimating
            ? 'Checking size…'
            : selection.estimate
              ? `${selection.estimate.originals ? 'Up to ' : ''}${formatBytes(selection.estimate.bytes)} new${selection.estimate.reusedBytes ? ` · ${formatBytes(selection.estimate.reusedBytes)} reused` : ''}${selection.estimate.unknownFiles ? ' + unmeasured files' : ''}`
              : 'Size unavailable'}
        </small>
      ) : null}
      <span className="sr-only" role="status">
        {selection.selecting
          ? `${selection.selected.size} stories selected. Press the download button to start.`
          : busy
            ? label
            : ''}
      </span>
    </>
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
          ? 'Downloading these stories needs further reverse engineering of the original sources.'
          : 'Original sources still need verification or a downloader implementation.'
      }
    >
      {needsResearch ? (
        <CircleOff size={13} aria-hidden="true" />
      ) : (
        <Clock3 size={13} aria-hidden="true" />
      )}
      {needsResearch
        ? needsResearch === episodes.length
          ? 'Unsupported'
          : `${needsResearch} unsupported`
        : 'Downloader pending'}
    </span>
  );
}
