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
import { pjskGroups } from '../pjsk-groups';
import { PjskGroupMark } from '../components/PjskGroupMark';
import { storyCategories } from '../story-categories';
import { baSchools, featuredSchools } from '../ba-schools';
import { SchoolMarks } from '../components/SchoolMarks';
import { EventCover } from '../components/EventCover';
import { useNarrow } from '../hooks';

const scrollPositions = new Map<string, number>();
const eventTypes = [
  { value: 'story', label: 'Story Events' },
  { value: 'collaboration', label: 'Collaborations' },
  { value: 'special', label: 'Seasonal / Special' },
] as const;
export function CatalogPage() {
  const { game: id } = useParams();
  const game = gameById(id);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { data } = useStore();
  const scroll = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const query = params.get('q') ?? '';
  const requestedGroup = params.get('group');
  const group =
    game?.id === 'pjsk' && pjskGroups.some(({ id }) => id === requestedGroup)
      ? requestedGroup
      : 'all';
  const requestedCategory = params.get('category');
  const categories = storyCategories(game?.id);
  const category =
    categories.find((value) => value === requestedCategory) ?? 'all';
  const school =
    game?.id === 'ba' && baSchools.some((s) => s.id === params.get('school'))
      ? params.get('school')!
      : 'all';
  const requestedSort = params.get('sort');
  const requestedType = params.get('eventType');
  const eventType = eventTypes.some((type) => type.value === requestedType)
    ? (requestedType ?? 'all')
    : 'all';
  const showEventTypes = game?.id === 'gfl1' && category === 'Event';
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
  const missingCategory =
    game?.id === 'ba' &&
    category !== 'all' &&
    !events.some((event) => event.category === category);
  const missingSchool =
    school !== 'all' &&
    !events.some((event) =>
      featuredSchools(event).some((s) => s.id === school),
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
            (category === 'all' || event.category === category) &&
            (group === 'all' ||
              event.stories.some((story) => story.group === group)) &&
            (school === 'all' ||
              featuredSchools(event).some((s) => s.id === school)) &&
            (!showEventTypes ||
              eventType === 'all' ||
              event.eventType === eventType),
        )
        .sort((a, b) => {
          if (sort === 'story') return 0;
          const order =
            a.date.localeCompare(b.date) ||
            a.stories[0].order - b.stories[0].order;
          return sort === 'release' ? order : -order;
        }),
    [events, query, category, group, school, sort, showEventTypes, eventType],
  );
  const large = filtered.length > 80;
  const rowHeight = narrow
    ? game?.id === 'pjsk'
      ? 164
      : game?.id === 'ba'
        ? 164
        : 116
    : game?.id === 'ba'
      ? 136
      : 116;
  const virtual = useVirtualizer({
    count: large ? filtered.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });
  useLayoutEffect(() => {
    virtual.measure();
  }, [virtual, rowHeight]);
  const key = location.pathname + location.search;
  useLayoutEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = scrollPositions.get(key) ?? 0;
  }, [key]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(window.location.search);
    const defaultValue = key === 'sort' ? 'release-newest' : 'all';
    if (key === 'storyType') {
      next.delete('category');
      next.delete('eventType');
      if (value.startsWith('event:')) {
        next.set('category', 'Event');
        next.set('eventType', value.slice(6));
      } else if (value !== 'all') next.set('category', value);
    } else if (value && value !== defaultValue) next.set(key, value);
    else next.delete(key);
    if (key === 'category') next.delete('eventType');
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
        className={`event-row ${event.game === 'pjsk' ? 'pjsk-event-row' : ''} ${large ? 'virtual-event' : ''}`}
        key={event.id}
        style={
          start === undefined
            ? { height: rowHeight }
            : { height: rowHeight, transform: `translateY(${start}px)` }
        }
      >
        <Link to={catalogEventUrl(event, params)} state={{ from: key }}>
          {cover ? (
            <EventCover
              className={`event-cover${event.game === 'pjsk' ? ' pjsk-event-cover' : ''}`}
              cover={cover}
            />
          ) : (
            <span className="event-number">
              {String(index + 1).padStart(2, '0')}
            </span>
          )}
          <span className="event-info">
            <span className="event-meta">
              {event.game === 'pjsk' ? (
                <PjskGroupMark group={event.stories[0]?.group} />
              ) : null}
              <small>
                {event.category}
                {event.date &&
                (sort === 'release' || sort === 'release-newest') ? (
                  <>
                    {' '}
                    · <time dateTime={event.date}>{event.date}</time>
                  </>
                ) : null}
              </small>
            </span>
            <h2>{event.title}</h2>
            <span>
              {event.stories.length}{' '}
              {event.stories.length === 1 ? 'story' : 'stories'}
              {read ? ` · ${read} read` : ''}
              {event.branches.length
                ? ` · ${event.stories.length - event.main.length} side stories`
                : ''}
            </span>
            <SchoolMarks event={event} compact />
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
            : game.id === 'ba'
              ? 'Story collections'
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
          aria-label={
            game.id === 'gfl1'
              ? 'Story type'
              : game.id === 'ba'
                ? 'Story category'
                : 'Event category'
          }
          value={
            showEventTypes && eventType !== 'all'
              ? `event:${eventType}`
              : category
          }
          onChange={(e) =>
            update(
              game.id === 'gfl1' ? 'storyType' : 'category',
              e.target.value,
            )
          }
        >
          <option value="all">All collections</option>
          {game.id === 'gfl1' ? (
            <>
              <option>Main story</option>
              <option value="Event">All Events</option>
              {eventTypes.map((type) => {
                const count = events.filter(
                  (event) =>
                    event.category === 'Event' &&
                    event.eventType === type.value,
                ).length;
                return (
                  <option
                    key={type.value}
                    value={`event:${type.value}`}
                    disabled={!count}
                  >
                    {type.label} ({count})
                  </option>
                );
              })}
            </>
          ) : (
            categories.map((value) => (
              <option key={value} value={value}>
                {value}
                {game.id === 'ba'
                  ? ` (${events.filter((event) => event.category === value).length})`
                  : ''}
              </option>
            ))
          )}
        </select>
        {game.id === 'pjsk' ? (
          <select
            aria-label="Story group"
            value={group ?? 'all'}
            onChange={(e) => update('group', e.target.value)}
          >
            <option value="all">All groups</option>
            {pjskGroups.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
        {game.id === 'ba' ? (
          <select
            aria-label="School"
            value={school}
            onChange={(e) => update('school', e.target.value)}
          >
            <option value="all">All schools / affiliations</option>
            {baSchools.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} (
                {
                  events.filter((event) =>
                    featuredSchools(event).some((school) => school.id === s.id),
                  ).length
                }
                )
              </option>
            ))}
          </select>
        ) : null}
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
          {game.id === 'ba'
            ? filtered.length === 1
              ? 'collection'
              : 'collections'
            : filtered.length === 1
              ? 'event'
              : 'events'}
        </span>
        <Link className="text-link" to="/manage">
          Manage availability
        </Link>
      </div>
      {!filtered.length ? (
        <EmptyState
          title={
            missingCategory
              ? 'No imported stories in this category'
              : missingSchool
                ? 'No imported stories for this school'
                : !events.length && !examples
                  ? 'No events imported yet'
                  : 'No matching events'
          }
        >
          {missingCategory
            ? `${category} content has not been imported yet. Choose another category to read the available stories.`
            : missingSchool
              ? 'No stories featuring this school have been imported yet. Choose another school to browse the available collection.'
              : !events.length && !examples
                ? 'This game has not been connected. Its design fixtures are available under Cross-game design checks.'
                : game.id === 'pjsk'
                  ? 'Try another title, category or group.'
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
