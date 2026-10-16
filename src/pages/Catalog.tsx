import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';
import { gameById } from '../content';
import { groupStoryEvents } from '../catalog';
import { catalogEventUrl, catalogMode, catalogSource } from '../catalog-source';
import { useStore } from '../store';
import { EmptyState } from '../components/Primitives';
import { PageTitle } from '../components/Shell';
import { eventArtwork } from '../covers';

const scrollPositions = new Map<string, number>();
export function CatalogPage() {
  const { game: id } = useParams();
  const game = gameById(id);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { data } = useStore();
  const scroll = useRef<HTMLDivElement>(null);
  const query = params.get('q') ?? '';
  const requestedCategory = params.get('category');
  const category =
    requestedCategory === 'Main story' || requestedCategory === 'Event'
      ? requestedCategory
      : 'all';
  const requestedSort = params.get('sort');
  const sort =
    requestedSort === 'story' || requestedSort === 'release'
      ? requestedSort
      : 'release-newest';
  const { examples, previews, stress } = catalogMode(params);
  const events = useMemo(
    () =>
      groupStoryEvents(catalogSource(game?.id, { examples, previews, stress })),
    [game?.id, examples, previews, stress],
  );
  const filtered = useMemo(
    () =>
      events
        .filter(
          (event) =>
            (event.title.toLowerCase().includes(query.toLowerCase()) ||
              event.stories.some((story) =>
                story.title.toLowerCase().includes(query.toLowerCase()),
              )) &&
            (category === 'all' || event.category === category),
        )
        .sort((a, b) =>
          sort === 'release'
            ? a.date.localeCompare(b.date)
            : sort === 'release-newest'
              ? b.date.localeCompare(a.date)
              : 0,
        ),
    [events, query, category, sort],
  );
  const large = filtered.length > 80;
  const virtual = useVirtualizer({
    count: large ? filtered.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 116,
    overscan: 5,
  });
  const key = location.pathname + location.search;
  useLayoutEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = scrollPositions.get(key) ?? 0;
  }, [key]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    const defaultValue = key === 'sort' ? 'release-newest' : 'all';
    if (value && value !== defaultValue) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  if (!game)
    return (
      <main className="page">
        <EmptyState
          title="Game not found"
          action={<Link to="/library">Return to library</Link>}
        />
      </main>
    );
  const render = (index: number, start?: number) => {
    const event = filtered[index];
    const cover = eventArtwork(event);
    const read = event.stories.filter(
      (story) => data.saves[story.id]?.completed,
    ).length;
    return (
      <li
        className={`event-row ${large ? 'virtual-event' : ''}`}
        key={event.id}
        style={
          start === undefined
            ? undefined
            : { transform: `translateY(${start}px)` }
        }
      >
        <Link to={catalogEventUrl(event, params)} state={{ from: key }}>
          {cover ? (
            <img
              className="event-cover"
              src={cover.url}
              alt=""
              width={cover.width}
              height={cover.height}
              style={{ objectPosition: cover.position }}
            />
          ) : (
            <span className="event-number">
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          <span className="event-info">
            <small>
              {event.category}
              {sort === 'release' || sort === 'release-newest' ? (
                <>
                  {' '}
                  · <time dateTime={event.date}>{event.date}</time>
                </>
              ) : null}
            </small>
            <h2>{event.title}</h2>
            <span>
              {event.stories.length}{' '}
              {event.stories.length === 1 ? 'story' : 'stories'}
              {read ? ` · ${read} read` : ''}
              {event.branches.length
                ? ` · ${event.stories.length - event.main.length} side stories`
                : ''}
            </span>
          </span>
        </Link>
      </li>
    );
  };
  return (
    <main
      className="page catalog-page"
      style={{ '--game-accent': game.accent } as React.CSSProperties}
    >
      <PageTitle eyebrow={game.shortName} title={game.name} back="/library">
        <p>
          {examples
            ? 'Fictional events for interface checks.'
            : 'Events and story collections'}
        </p>
      </PageTitle>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search events"
            placeholder="Find an event or story…"
            value={query}
            onChange={(e) => update('q', e.target.value)}
          />
        </label>
        <select
          aria-label="Event category"
          value={category}
          onChange={(e) => update('category', e.target.value)}
        >
          <option value="all">All collections</option>
          <option>Main story</option>
          <option>Event</option>
        </select>
        <select
          aria-label="Event order"
          value={sort}
          onChange={(e) => update('sort', e.target.value)}
        >
          <option value="story">Source order</option>
          <option value="release">Release order · oldest first</option>
          <option value="release-newest">Release order · newest first</option>
        </select>
      </div>
      <div className="section-title">
        <span className="muted">
          {filtered.length.toLocaleString()}{' '}
          {filtered.length === 1 ? 'event' : 'events'}
        </span>
        <Link className="text-link" to="/manage">
          Manage availability
        </Link>
      </div>
      {!filtered.length ? (
        <EmptyState
          title={
            !events.length && !examples
              ? 'No events imported yet'
              : 'No matching events'
          }
        >
          {!events.length && !examples
            ? 'This game has not been connected. Its design fixtures are available under Cross-game design checks.'
            : 'Try another title or category.'}
        </EmptyState>
      ) : (
        <div
          className="catalog-scroll"
          ref={scroll}
          onScroll={(e) => scrollPositions.set(key, e.currentTarget.scrollTop)}
          aria-label="Events"
        >
          <ol
            className="event-list"
            style={
              large
                ? { height: virtual.getTotalSize(), position: 'relative' }
                : undefined
            }
          >
            {large
              ? virtual
                  .getVirtualItems()
                  .map((item) => render(item.index, item.start))
              : filtered.map((_, index) => render(index))}
          </ol>
        </div>
      )}
    </main>
  );
}
