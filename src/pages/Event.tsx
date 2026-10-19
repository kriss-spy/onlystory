import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Search } from 'lucide-react';
import { gameById } from '../content';
import { groupStoryEvents, storyRows } from '../catalog';
import { catalogMode, catalogSource, modeSearch } from '../catalog-source';
import { EmptyState } from '../components/Primitives';
import { PageTitle } from '../components/Shell';
import { StorySections } from '../components/StorySections';
import { eventArtwork, artworkStyle } from '../covers';
import { PjskGroupMark } from '../components/PjskGroupMark';
import { SchoolMarks } from '../components/SchoolMarks';
import { EventCover } from '../components/EventCover';
import { CatalogLayout } from '../components/CatalogLayout';

const scrollPositions = new Map<string, number>();
export function EventPage() {
  const { game: id, event: eventId } = useParams();
  const game = gameById(id);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const scroll = useRef<HTMLDivElement>(null);
  const { examples, previews, stress } = catalogMode(params);
  const events = useMemo(
    () =>
      groupStoryEvents(catalogSource(game?.id, { examples, previews, stress })),
    [game?.id, examples, previews, stress],
  );
  const event = events.find((event) => event.id === eventId);
  const cover = event ? eventArtwork(event) : undefined;
  const query = params.get('q') ?? '';
  const rows = useMemo(
    () => (event ? storyRows(event, query) : { main: [], independent: [] }),
    [event, query],
  );
  const fallback = `/games/${id}${modeSearch(params)}`;
  const from =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith(`/games/${id}`)
      ? location.state.from
      : fallback;
  const key = location.pathname + location.search;
  useLayoutEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = scrollPositions.get(key) ?? 0;
  }, [key]);
  if (!game || !event)
    return (
      <main className="page">
        <EmptyState
          title="Event not found"
          action={<Link to={fallback}>Return to events</Link>}
        >
          This event is not in the current library.
        </EmptyState>
      </main>
    );
  return (
    <main
      className="page event-page"
      style={{ '--game-accent': game.accent } as React.CSSProperties}
    >
      <div className="event-heading">
        <PageTitle
          eyebrow={`${game.shortName} · ${event.category}`}
          title={event.title}
          back={from}
        >
          <p className="event-summary">
            {event.game === 'pjsk' ? (
              <PjskGroupMark group={event.stories[0]?.group} />
            ) : null}
            {event.stories.length} stories
            {event.branches.length
              ? ` · ${event.main.length} main · ${event.stories.length - event.main.length} side`
              : ''}
          </p>
          {event.notice ? <p role="note">{event.notice}</p> : null}
          <SchoolMarks event={event} />
        </PageTitle>
        {cover ? (
          cover.logo ? (
            <EventCover
              className={`event-heading-cover${event.game === 'pjsk' ? ' pjsk-event-cover' : ''}`}
              cover={cover}
            />
          ) : (
            <figure className="event-artwork">
              <img
                className={`event-heading-cover${event.game === 'pjsk' ? ' pjsk-event-cover' : ''}`}
                src={cover.url}
                alt=""
                width={cover.width}
                height={cover.height}
                style={artworkStyle(cover)}
              />
              {cover.credit && cover.page ? (
                <figcaption>
                  <a href={cover.page} target="_blank" rel="noreferrer">
                    {cover.kind === 'unofficial-art'
                      ? 'Unofficial artwork'
                      : 'Official artwork'}{' '}
                    · {cover.credit}
                  </a>
                </figcaption>
              ) : null}
            </figure>
          )
        ) : null}
      </div>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search stories"
            placeholder="Find a story…"
            value={query}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set('q', e.target.value);
              else next.delete('q');
              setParams(next, { replace: true });
            }}
          />
        </label>
        <CatalogLayout />
      </div>
      {!rows.main.length && !rows.independent.length ? (
        <EmptyState title="No matching stories">Try another title.</EmptyState>
      ) : (
        <div
          className="event-outline"
          ref={scroll}
          onScroll={(e) => scrollPositions.set(key, e.currentTarget.scrollTop)}
        >
          <StorySections
            key={event.id}
            event={event}
            query={query}
            from={key}
            catalogFrom={from}
          />
        </div>
      )}
    </main>
  );
}
