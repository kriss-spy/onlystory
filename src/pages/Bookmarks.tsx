import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Search, Trash2 } from 'lucide-react';
import { episodeById, gameById } from '../content';
import { passageUrl } from '../model';
import { useStore } from '../store';
import { EmptyState, IconButton } from '../components/Primitives';
import { PageTitle } from '../components/Shell';
import { useI18n } from '../i18n';

export function BookmarksPage() {
  const { t, locale } = useI18n();
  const { data, setData, notify } = useStore();
  const [query, setQuery] = useState('');
  const items = data.bookmarks
    .filter((b) =>
      `${b.label} ${episodeById(b.episodeId)?.title ?? ''} ${gameById(episodeById(b.episodeId)?.game)?.name ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <main className="page">
      <PageTitle eyebrow={t('YOUR COLLECTION')} title={t('Saved passages')}>
        <p>{t('A line worth returning to, with its story branch intact.')}</p>
      </PageTitle>
      <label className="search-field">
        <Search size={17} />
        <input
          type="search"
          aria-label={t('Search bookmarks')}
          placeholder={t('Find a passage or episode…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!items.length ? (
        <EmptyState
          title={
            query ? t('No matching bookmarks') : t('Nothing bookmarked yet')
          }
          action={
            !query ? (
              <Link className="button primary-button" to="/library">
                {t('Browse the library')}
              </Link>
            ) : undefined
          }
        >
          {query
            ? t('Try another word or episode title.')
            : t('Use the bookmark icon or B while reading to keep a passage.')}
        </EmptyState>
      ) : (
        <div className="bookmark-list">
          {items.map((item) => {
            const episode = episodeById(item.episodeId);
            if (!episode)
              return (
                <article className="bookmark-item" key={item.id}>
                  <Bookmark size={18} />
                  <div>
                    <strong>{item.label}</strong>
                    <p className="muted">
                      {t(
                        'This episode is not in the current library. Its bookmark is preserved.',
                      )}
                    </p>
                  </div>
                </article>
              );
            return (
              <article className="bookmark-item" key={item.id}>
                <Bookmark size={18} />
                <Link
                  to={passageUrl(episode, item.snapshot)}
                  state={{ from: '/bookmarks' }}
                >
                  <small>
                    {gameById(episode.game)?.shortName} · {episode.title}
                  </small>
                  <p>{item.label}</p>
                  <span className="field-note">
                    {Object.keys(item.snapshot.frames.at(-1)!.answers).length
                      ? t('Branch included')
                      : t('Story opening')}{' '}
                    · {new Date(item.createdAt).toLocaleDateString(locale)}
                  </span>
                </Link>
                <IconButton
                  label={t('Remove bookmark')}
                  onClick={() => {
                    setData((old) => ({
                      ...old,
                      bookmarks: old.bookmarks.filter((b) => b.id !== item.id),
                    }));
                    notify(t('Bookmark removed.'), {
                      label: t('Undo'),
                      run: () =>
                        setData((old) => ({
                          ...old,
                          bookmarks: old.bookmarks.some((b) => b.id === item.id)
                            ? old.bookmarks
                            : [...old.bookmarks, item],
                        })),
                    });
                  }}
                >
                  <Trash2 size={17} />
                </IconButton>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
