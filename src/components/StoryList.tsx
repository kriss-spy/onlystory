import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Download } from 'lucide-react';
import { episodeById } from '../content';
import { passageUrl, startSave } from '../model';
import type { StoryRow } from '../catalog';
import { isInstalled, useStore } from '../store';
import { useNarrow } from '../hooks';
import { IconButton } from './Primitives';

const scrollPositions = new Map<string, number>();
export function StoryList({
  rows,
  from,
  catalogFrom,
  independent = false,
}: {
  rows: StoryRow[];
  from: string;
  catalogFrom?: string;
  independent?: boolean;
}) {
  const { data, download, transfers } = useStore();
  const scroll = useRef<HTMLDivElement>(null);
  const height = useNarrow() ? 148 : 116;
  const large = rows.length > 80;
  const scrollKey = `${from}:${independent}`;
  useLayoutEffect(() => {
    if (large && scroll.current)
      scroll.current.scrollTop = scrollPositions.get(scrollKey) ?? 0;
  }, [large, scrollKey]);
  const virtual = useVirtualizer({
    count: large ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => height,
    overscan: 5,
  });
  const lastFork = rows.reduce(
    (last, row, index) => (!row.branch || row.branchStart ? index : last),
    -1,
  );
  const render = (row: StoryRow, index: number, start?: number) => {
    const { episode, branch } = row;
    // Stress archives use existing, explicitly fictional playback fixtures.
    const actual =
      episodeById(episode.id) ??
      (import.meta.env.DEV && episode.id.startsWith('stress-')
        ? episodeById('gfl2-1')!
        : episode);
    const save = data.saves[actual.id];
    const installed = isInstalled(data, actual);
    const href = passageUrl(actual, save ?? startSave(actual));
    return (
      <li
        key={episode.id}
        data-story-id={episode.id}
        data-story-kind={branch ? 'side' : 'main'}
        className={`story-path-item ${branch ? 'side-story' : ''} ${row.branchStart ? 'branch-start' : ''} ${row.branchEnd ? 'branch-end' : ''} ${large ? 'virtual-story' : ''}`}
        style={
          start === undefined
            ? undefined
            : { transform: `translateY(${start}px)` }
        }
      >
        {!independent && index <= lastFork ? (
          <span
            aria-hidden="true"
            className={`main-spine ${index === 0 ? 'spine-start' : ''} ${index === lastFork ? (branch ? 'spine-fork-end' : 'spine-end') : ''}`}
          />
        ) : null}
        {branch ? <span aria-hidden="true" className="branch-spine" /> : null}
        <span aria-hidden="true" className="story-point" />
        <article className="story-card">
          <Link
            className="story-card-link"
            to={href}
            state={{ from, catalogFrom }}
          >
            <small>
              {branch
                ? `Side story${branch.title ? ` · ${branch.title}` : ''}`
                : `${episode.game === 'ba' ? (episode.category === 'Event' ? 'Event story' : episode.category) : 'Main story'} · ${String(episode.order).padStart(2, '0')}`}
            </small>
            <h2>{episode.title}</h2>
            <p>{episode.description}</p>
            <span className="episode-meta">
              {save?.completed ? (
                <>
                  <Check size={12} /> Read
                </>
              ) : save ? (
                'In progress'
              ) : installed ? (
                'On this device'
              ) : episode.availability === 'incomplete' ? (
                'Partial archive'
              ) : null}
              <span>{episode.minutes} min</span>
            </span>
          </Link>
          {!installed ? (
            <IconButton
              label={`Download ${episode.title}`}
              disabled={transfers[actual.id]?.status === 'downloading'}
              onClick={() => download(actual)}
            >
              <Download size={18} />
            </IconButton>
          ) : null}
        </article>
      </li>
    );
  };
  return (
    <div
      ref={scroll}
      onScroll={(e) =>
        scrollPositions.set(scrollKey, e.currentTarget.scrollTop)
      }
      className={`story-list-scroll ${large ? 'large-story-list' : ''}`}
      style={{ '--story-row-height': `${height}px` } as React.CSSProperties}
    >
      <ol
        className={`story-list ${independent ? 'independent-stories' : ''}`}
        aria-label={
          independent
            ? 'Side stories outside the main timeline'
            : 'Event stories'
        }
        style={
          large
            ? { height: virtual.getTotalSize(), position: 'relative' }
            : undefined
        }
      >
        {large
          ? virtual
              .getVirtualItems()
              .map((item) => render(rows[item.index], item.index, item.start))
          : rows.map((row, index) => render(row, index))}
      </ol>
    </div>
  );
}
