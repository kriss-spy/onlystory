import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Download } from 'lucide-react';
import { gameById } from '../content';
import { compareReleaseDates, groupStoryEvents } from '../catalog';
import { catalogEventUrl, catalogMode, catalogSource } from '../catalog-source';
import { isInstalled, useStore } from '../store';
import { GettingStarted } from '../components/GettingStarted';
import { useI18n } from '../i18n';
import { EmptyState } from '../components/Primitives';
import { PageTitle } from '../components/Shell';
import { CatalogWorkspace } from '../components/CatalogWorkspace';
import { eventArtwork } from '../covers';
import { pjskGroups } from '../pjsk-groups';
import { PjskGroupMark } from '../components/PjskGroupMark';
import { storyCategories } from '../story-categories';
import { baSchools, featuredSchools } from '../ba-schools';
import { SchoolMarks } from '../components/SchoolMarks';
import { EventCover } from '../components/EventCover';
import { useNarrow } from '../hooks';
import { matchesSearch } from '../search';
import { CatalogLayout } from '../components/CatalogLayout';
import { TextLanguages } from '../components/TextLanguages';
import { gamePreferences } from '../model';
import { collectionTitle, titleSearchValues } from '../localized-titles';
import { SearchInput } from '../components/SearchInput';
import {
  DownloadCheckbox,
  DownloadSupportNotice,
  useDownloadSelection,
} from '../components/DownloadSelection';

const scrollPositions = new Map<string, number>();
const eventTypes = [
  { value: 'story', label: 'Story Events' },
  { value: 'collaboration', label: 'Collaborations' },
  { value: 'special', label: 'Seasonal / Special' },
] as const;
export function CatalogPage() {
  const { t } = useI18n();
  const { game: id } = useParams();
  const game = gameById(id);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { data } = useStore();
  const titleLocale = game
    ? gamePreferences(data.preferences, game.id).catalogLocale
    : data.preferences.catalogLocale;
  const selection = useDownloadSelection();
  const scroll = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const layout = data.preferences.catalogLayout ?? 'list';
  const columns = layout === 'grid' && !narrow ? 2 : 1;
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
  const defaultSort =
    game?.id === 'ba' && category === 'Main story' ? 'story' : 'release-newest';
  const sort = [
    'story',
    'release',
    'release-newest',
    'title',
    'title-desc',
    'progress',
  ].includes(requestedSort ?? '')
    ? requestedSort!
    : defaultSort;
  const { examples, previews, stress } = catalogMode(params);
  const events = useMemo(
    () =>
      groupStoryEvents(catalogSource(game?.id, { examples, previews, stress })),
    [game?.id, examples, previews, stress],
  );
  const eventOrder = useMemo(
    () => new Map(events.map((event, index) => [event.id, index])),
    [events],
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
            matchesSearch(query, [
              event.title,
              ...event.stories.flatMap(titleSearchValues),
            ]) &&
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
          if (sort === 'title' || sort === 'title-desc')
            return (
              collectionTitle(a, titleLocale).localeCompare(
                collectionTitle(b, titleLocale),
              ) * (sort === 'title' ? 1 : -1)
            );
          if (sort === 'progress') {
            const fraction = (event: typeof a) =>
              event.stories.filter((story) => data.saves[story.id]?.completed)
                .length / event.stories.length;
            return (
              fraction(b) - fraction(a) ||
              collectionTitle(a, titleLocale).localeCompare(
                collectionTitle(b, titleLocale),
              )
            );
          }
          const newest = sort === 'release-newest';
          return (
            compareReleaseDates(a, b, newest) ||
            (a.date && b.date
              ? (eventOrder.get(a.id)! - eventOrder.get(b.id)!) *
                (newest ? -1 : 1)
              : 0)
          );
        }),
    [
      events,
      eventOrder,
      query,
      category,
      group,
      school,
      sort,
      showEventTypes,
      eventType,
      data.saves,
      titleLocale,
    ],
  );
  const undated = filtered.filter((event) => !event.date).length;
  const releaseOrder = sort === 'release' || sort === 'release-newest';
  const large = filtered.length > 80;
  const rowHeight = layout === 'table' ? 92 : layout === 'grid' ? 264 : 124;
  const virtual = useVirtualizer({
    count: large ? Math.ceil(filtered.length / columns) : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });
  useLayoutEffect(() => {
    virtual.measure();
  }, [virtual, rowHeight, columns]);
  const key = location.pathname + location.search + ':' + layout;
  useLayoutEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = scrollPositions.get(key) ?? 0;
  }, [key]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(window.location.search);
    const defaultValue = key === 'sort' ? defaultSort : 'all';
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
          title={t('Game not found')}
          action={<Link to="/library">{t('Return to library')}</Link>}
        />
      </main>
    );
  const render = (index: number, start?: number) => {
    const event = filtered[index];
    const cover = eventArtwork(event);
    const selectEvent = (click: React.MouseEvent) => {
      if (selection.selecting) {
        click.preventDefault();
        selection.toggle(event.stories);
      }
    };
    const checkbox = (
      <DownloadCheckbox
        episodes={event.stories}
        label={t('Select {value0}', {
          value0: collectionTitle(event, titleLocale),
        })}
      />
    );
    const read = event.stories.filter(
      (story) => data.saves[story.id]?.completed,
    ).length;
    const downloaded = event.stories.filter((story) =>
      isInstalled(data, story),
    ).length;
    const downloadedMark = downloaded ? (
      <span className="downloaded-mark">
        <Download size={12} aria-hidden="true" />
        {downloaded === event.stories.length
          ? t('Downloaded')
          : t('{count} downloaded', { count: downloaded })}
      </span>
    ) : null;
    if (layout === 'table')
      return (
        <tr
          key={event.id}
          className={`event-row ${large ? 'virtual-event' : ''}`}
          style={{
            height: rowHeight,
            ...(start === undefined
              ? {}
              : { transform: `translateY(${start}px)` }),
          }}
        >
          <td>
            {checkbox}
            <Link
              onClick={selectEvent}
              aria-disabled={
                selection.selecting && !event.stories.some(selection.eligible)
                  ? true
                  : undefined
              }
              to={catalogEventUrl(event, params)}
              state={{ from: location.pathname + location.search }}
            >
              {collectionTitle(event, titleLocale)}
            </Link>
            <small>{t(event.category)}</small>
            <DownloadSupportNotice episodes={event.stories} />
            {downloadedMark}
            <TextLanguages stories={event.stories} />
          </td>
          <td>
            {event.date ? (
              <time dateTime={event.date}>{event.date}</time>
            ) : (
              t('Release date unavailable')
            )}
          </td>
          <td>{event.stories.length}</td>
          <td>
            {t('{read} of {total} read', { read, total: event.stories.length })}
          </td>
        </tr>
      );
    return (
      <li
        className={`event-row ${event.game === 'pjsk' ? 'pjsk-event-row' : ''}`}
        key={event.id}
      >
        {checkbox}
        <Link
          onClick={selectEvent}
          aria-disabled={
            selection.selecting && !event.stories.some(selection.eligible)
              ? true
              : undefined
          }
          to={catalogEventUrl(event, params)}
          state={{ from: location.pathname + location.search }}
        >
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
                {t(event.category)}
                {releaseOrder ? (
                  <>
                    {' '}
                    ·{' '}
                    {event.date ? (
                      <time dateTime={event.date}>{event.date}</time>
                    ) : (
                      t('Release date unavailable')
                    )}
                  </>
                ) : null}
              </small>
            </span>
            <h2>{collectionTitle(event, titleLocale)}</h2>
            <DownloadSupportNotice episodes={event.stories} />
            {downloadedMark}
            <span>
              {event.stories.length}{' '}
              {event.stories.length === 1 ? t('story') : t('stories')}
              {read ? t(' · {value0} read', { value0: read }) : ''}
              {event.branches.length
                ? t(' · {value0} side stories', {
                    value0: event.stories.length - event.main.length,
                  })
                : ''}
            </span>
            <SchoolMarks event={event} compact />
            <TextLanguages stories={event.stories} />
          </span>
        </Link>
      </li>
    );
  };
  return (
    <CatalogWorkspace
      className={`catalog-page catalog-layout-${layout}`}
      style={{ '--game-accent': game.accent } as React.CSSProperties}
      title={game.name}
      back="/library"
      sidebar={
        <>
          <PageTitle title={game.name} />
          <div className="catalog-filters">
            <select
              aria-label={
                game.id === 'gfl1'
                  ? t('Story type')
                  : game.id === 'ba'
                    ? t('Story category')
                    : t('Event category')
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
              <option value="all">{t('All collections')}</option>
              {game.id === 'gfl1' ? (
                <>
                  <option value="Main story">{t('Main story')}</option>
                  <option value="Event">{t('All Events')}</option>
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
                        {t(type.label)} ({count})
                      </option>
                    );
                  })}
                </>
              ) : (
                categories.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                    {game.id === 'ba'
                      ? t(' ({value0})', {
                          value0: events.filter(
                            (event) => event.category === value,
                          ).length,
                        })
                      : ''}
                  </option>
                ))
              )}
            </select>
            {game.id === 'pjsk' ? (
              <select
                aria-label={t('Story group')}
                value={group ?? 'all'}
                onChange={(e) => update('group', e.target.value)}
              >
                <option value="all">{t('All groups')}</option>
                {pjskGroups.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            ) : null}
            {game.id === 'ba' ? (
              <select
                aria-label={t('School')}
                value={school}
                onChange={(e) => update('school', e.target.value)}
              >
                <option value="all">{t('All schools / affiliations')}</option>
                {baSchools.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name} (
                    {
                      events.filter((event) =>
                        featuredSchools(event).some(
                          (school) => school.id === s.id,
                        ),
                      ).length
                    }
                    )
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <GettingStarted game={game.id} />
        </>
      }
    >
      <header className="catalog-content-heading">
        <h2>{game.id === 'ba' ? t('Collections') : t('Events')}</h2>
        <span className="muted">{filtered.length.toLocaleString()}</span>
      </header>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={17} />
          <SearchInput
            type="search"
            aria-label={t('Search events')}
            placeholder={t('Find an event or story…')}
            value={query}
            onValueChange={(value) => update('q', value)}
          />
        </label>
        <select
          aria-label={t('Event order')}
          value={sort}
          onChange={(e) => update('sort', e.target.value)}
        >
          <option value="story">{t('Source order')}</option>
          <option value="release">{t('Release order · oldest first')}</option>
          <option value="release-newest">
            {t('Release order · newest first')}
          </option>
          <option value="title">{t('Title · A–Z')}</option>
          <option value="title-desc">{t('Title · Z–A')}</option>
          <option value="progress">{t('Reading progress')}</option>
        </select>
        <CatalogLayout />
      </div>
      {releaseOrder && undated > 0 ? (
        <p className="muted release-order-note" role="note">
          {t(
            undated === 1
              ? '{count} collection has no release date in the imported source. Undated collections appear after dated releases, in source order.'
              : '{count} collections have no release date in the imported source. Undated collections appear after dated releases, in source order.',
            { count: undated },
          )}
        </p>
      ) : null}
      {!filtered.length ? (
        <EmptyState
          title={
            missingCategory
              ? t('No imported stories in this category')
              : missingSchool
                ? t('No imported stories for this school')
                : !events.length && !examples
                  ? t('No events imported yet')
                  : t('No matching events')
          }
        >
          {missingCategory
            ? t(
                '{value0} content has not been imported yet. Choose another category to read the available stories.',
                { value0: category },
              )
            : missingSchool
              ? t(
                  'No stories featuring this school have been imported yet. Choose another school to browse the available collection.',
                )
              : !events.length && !examples
                ? t(
                    'This game has not been connected. Its design fixtures are available under Cross-game design checks.',
                  )
                : game.id === 'pjsk'
                  ? t('Try another title, category or group.')
                  : t('Try another title or category.')}
        </EmptyState>
      ) : (
        <div
          className="catalog-scroll"
          ref={scroll}
          onScroll={(e) => scrollPositions.set(key, e.currentTarget.scrollTop)}
          aria-label={t('Events')}
        >
          {layout === 'table' ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th
                    scope="col"
                    aria-sort={
                      sort === 'title'
                        ? 'ascending'
                        : sort === 'title-desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      onClick={() =>
                        update(
                          'sort',
                          sort === 'title' ? 'title-desc' : 'title',
                        )
                      }
                    >
                      {t('Title')}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={
                      sort === 'release'
                        ? 'ascending'
                        : sort === 'release-newest'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      onClick={() =>
                        update(
                          'sort',
                          sort === 'release' ? 'release-newest' : 'release',
                        )
                      }
                    >
                      {t('Release')}
                    </button>
                  </th>
                  <th scope="col">{t('Stories')}</th>
                  <th
                    scope="col"
                    aria-sort={sort === 'progress' ? 'descending' : 'none'}
                  >
                    <button onClick={() => update('sort', 'progress')}>
                      {t('Read')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody
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
              </tbody>
            </table>
          ) : (
            <ol
              className={`event-list collection-${layout}${large ? ' collection-virtual' : ''}`}
              style={
                large
                  ? { height: virtual.getTotalSize(), position: 'relative' }
                  : undefined
              }
            >
              {large
                ? virtual.getVirtualItems().map((item) => (
                    <li
                      key={item.key}
                      className="virtual-collection-row"
                      data-index={item.index}
                      ref={virtual.measureElement}
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <ol
                        className={`event-list collection-${layout}`}
                        start={item.index * columns + 1}
                      >
                        {Array.from(
                          { length: columns },
                          (_, column) => item.index * columns + column,
                        )
                          .filter((index) => index < filtered.length)
                          .map((index) => render(index))}
                      </ol>
                    </li>
                  ))
                : filtered.map((_, index) => render(index))}
            </ol>
          )}
        </div>
      )}
    </CatalogWorkspace>
  );
}
