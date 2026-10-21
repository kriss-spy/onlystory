import { ArrowUpRight, ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  episodeById,
  games,
  realEpisodes as importedEpisodes,
  episodes,
  fullEvent,
  eventForEpisode,
} from '../content';
import { gamePreferences, passageUrl, startSave } from '../model';
import { collectionTitle, episodeTitle } from '../localized-titles';
import { eventUrl, groupStoryEvents } from '../catalog';
import { useStore } from '../store';
import { hasOnlineSource } from '../downloads/providers';
import { useLocalLibrary } from '../hooks';
import { eventArtwork, gameArtwork, artworkStyle } from '../covers';

const importedIds = new Set(importedEpisodes.map((episode) => episode.id));
const libraryEpisodes = [
  ...importedEpisodes,
  ...episodes.filter((episode) => !importedIds.has(episode.id)),
];

export function LibraryPage() {
  const { data } = useStore();
  const localLibrary = useLocalLibrary();
  const realEpisodes = libraryEpisodes.filter(
    (episode) =>
      episode.origin === 'game' &&
      !episode.preview &&
      (localLibrary || hasOnlineSource(episode) || data.installed[episode.id]),
  );
  const featuredCover =
    !window.onlystoryDesktop && realEpisodes[0]
      ? eventArtwork(eventForEpisode(realEpisodes[0]))
      : undefined;
  const recent = Object.values(data.saves)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(
      (s) =>
        episodeById(s.episodeId)?.origin === 'game' &&
        !episodeById(s.episodeId)?.preview &&
        realEpisodes.some((episode) => episode.id === s.episodeId),
    )
    .slice(0, 3);
  return (
    <main className="page library-page">
      {recent.length ? (
        <section className="continue-section">
          <div className="section-title">
            <h2>Continue reading</h2>
            <span className="muted">Saved on this device</span>
          </div>
          <div className="continue-list">
            {recent.map((save) => {
              const episode = episodeById(save.episodeId)!;
              const game = games.find((g) => g.id === episode.game)!;
              const locale = gamePreferences(
                data.preferences,
                episode.game,
              ).catalogLocale;
              return (
                <Link
                  className="continue-card"
                  to={passageUrl(episode, save)}
                  key={episode.id}
                >
                  <span
                    className="continue-symbol"
                    style={{ color: game.accent }}
                  >
                    <Play size={19} />
                  </span>
                  <span>
                    <small>
                      {game.shortName} ·{' '}
                      {collectionTitle(eventForEpisode(episode), locale)}
                    </small>
                    <strong>{episodeTitle(episode, locale)}</strong>
                    <small>
                      {save.completed
                        ? 'Finished · revisit'
                        : `${save.frames.length} passages into this episode`}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              );
            })}
          </div>
        </section>
      ) : realEpisodes[0] ? (
        <Link
          className="first-story"
          to={eventUrl(eventForEpisode(realEpisodes[0]))}
        >
          {featuredCover ? (
            <img
              className="featured-event-cover"
              src={featuredCover.url}
              alt=""
              width={featuredCover.width}
              height={featuredCover.height}
              style={artworkStyle(featuredCover)}
            />
          ) : null}
          <span>
            <small>
              {games
                .find((game) => game.id === realEpisodes[0].game)
                ?.name.toUpperCase()}{' '}
              ·{' '}
              {realEpisodes[0].textLocales?.includes('en')
                ? 'Original English text'
                : realEpisodes[0].textLocales?.includes('ja')
                  ? '日本語原文'
                  : '简中原文'}
            </small>
            <strong>
              {collectionTitle(
                eventForEpisode(realEpisodes[0]),
                gamePreferences(data.preferences, realEpisodes[0].game)
                  .catalogLocale,
              )}
            </strong>
            <span>
              {realEpisodes[0].game !== 'gfl2'
                ? `${realEpisodes.filter((episode) => episode.collectionId === realEpisodes[0].collectionId).length} stories · ${localLibrary ? 'Original text and available media' : 'Available to download'}`
                : fullEvent
                  ? `${fullEvent.coverage.sections} 节 · ${fullEvent.coverage.textRows.toLocaleString()} 段原文 · 含原始说话人`
                  : '长梦初醒 · 原始 CG、音乐与音效 · 开场片段'}
            </span>
          </span>
          <ArrowRight size={25} />
        </Link>
      ) : (
        <p className="field-note">
          No game content imported. Run npm run import:gfl2 with your local
          prototype available.
        </p>
      )}
      <section>
        <div className="section-title">
          <h2>Your games</h2>
          <span className="muted">{realEpisodes.length} stories</span>
        </div>
        <div className="game-grid">
          {games.map((game) => {
            const imported = realEpisodes.filter(
              (episode) => episode.game === game.id,
            );
            const cover = window.onlystoryDesktop
              ? undefined
              : gameArtwork(game.id);
            const eventCount = groupStoryEvents(imported).length;
            return (
              <Link
                className="game-card"
                to={`/games/${game.id}`}
                key={game.id}
                style={{ '--game-accent': game.accent } as React.CSSProperties}
              >
                <div className="game-cover">
                  {cover ? (
                    <img
                      src={cover.url}
                      alt=""
                      width={cover.width}
                      height={cover.height}
                      style={{ objectPosition: cover.position }}
                    />
                  ) : (
                    <span>{game.shortName}</span>
                  )}
                </div>
                <div className="game-copy">
                  <small>
                    {imported.length
                      ? `${eventCount} ${eventCount === 1 ? 'EVENT' : 'EVENTS'}`
                      : 'DOWNLOADER PENDING'}
                  </small>
                  <h2>{game.name}</h2>
                  <p>
                    {imported[0]
                      ? collectionTitle(
                          eventForEpisode(imported[0]),
                          gamePreferences(data.preferences, game.id)
                            .catalogLocale,
                        )
                      : 'Downloader not available yet.'}
                  </p>
                  <span className="game-open">
                    {imported.length ? 'Browse events' : 'View library'}
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <footer className="page-note">
        <span className="status-dot" />
        Stories and progress stay on this device
      </footer>
    </main>
  );
}
