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
import { CatalogWorkspace } from '../components/CatalogWorkspace';
import { StorySections } from '../components/StorySections';
import { eventArtwork, artworkStyle } from '../covers';
import { PjskGroupMark } from '../components/PjskGroupMark';
import { SchoolMarks } from '../components/SchoolMarks';
import { EventCover } from '../components/EventCover';
import { CatalogLayout } from '../components/CatalogLayout';
import { TextLanguages } from '../components/TextLanguages';
import { isInstalled, useStore } from '../store';
import { gamePreferences } from '../model';
import { GettingStarted } from '../components/GettingStarted';
import { useI18n } from '../i18n';
import { collectionTitle } from '../localized-titles';
import { SearchInput } from '../components/SearchInput';

const scrollPositions = new Map<string, number>();
export function EventPage() {
  const { t } = useI18n();
  const { game: id, event: eventId } = useParams();
  const game = gameById(id);
  const { data } = useStore();
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
          title={t('Event not found')}
          action={<Link to={fallback}>{t('Return to events')}</Link>}
        >
          {t('This event is not in the current library.')}
        </EmptyState>
      </main>
    );
  return (
    <CatalogWorkspace
      className="event-page"
      style={{ '--game-accent': game.accent } as React.CSSProperties}
      title={collectionTitle(
        event,
        gamePreferences(data.preferences, game.id).catalogLocale,
      )}
      back={from}
      sidebar={
        <>
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
                        ? t('Unofficial artwork')
                        : t('Official artwork')}{' '}
                      · {cover.credit}
                    </a>
                  </figcaption>
                ) : null}
              </figure>
            )
          ) : null}

          <PageTitle
            eyebrow={`${game.shortName} · ${t(event.category)}`}
            title={collectionTitle(
              event,
              gamePreferences(data.preferences, game.id).catalogLocale,
            )}
          >
            <p className="event-summary">
              {event.game === 'pjsk' ? (
                <PjskGroupMark group={event.stories[0]?.group} />
              ) : null}
              {event.stories.length === 1
                ? t('1 story')
                : t('{count} stories', { count: event.stories.length })}
              {event.branches.length
                ? t(' · {value0} main · {value1} side', {
                    value0: event.main.length,
                    value1: event.stories.length - event.main.length,
                  })
                : ''}
            </p>
            <p className="event-download-status">
              {t('{downloaded} of {total} downloaded · {read} read', {
                downloaded: event.stories.filter((story) =>
                  isInstalled(data, story),
                ).length,
                total: event.stories.length,
                read: event.stories.filter(
                  (story) => data.saves[story.id]?.completed,
                ).length,
              })}
            </p>
            <TextLanguages stories={event.stories} />
            {event.notice ? <p role="note">{event.notice}</p> : null}
            <SchoolMarks event={event} />
          </PageTitle>
          <GettingStarted game={game.id} />
        </>
      }
    >
      <header className="catalog-content-heading">
        <h2>{t('Stories')}</h2>
        <span className="muted">
          {rows.main.length + rows.independent.length}
        </span>
      </header>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <SearchInput
            type="search"
            aria-label={t('Search stories')}
            placeholder={t('Find a story…')}
            value={query}
            onValueChange={(value) => {
              const next = new URLSearchParams(params);
              if (value) next.set('q', value);
              else next.delete('q');
              setParams(next, { replace: true });
            }}
          />
        </label>
        <CatalogLayout />
      </div>
      {!rows.main.length && !rows.independent.length ? (
        <EmptyState title={t('No matching stories')}>
          {t('Try another title.')}
        </EmptyState>
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
    </CatalogWorkspace>
  );
}
