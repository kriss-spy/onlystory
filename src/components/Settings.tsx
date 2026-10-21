import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Download, Upload } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { games, episodes } from '../content';
import { gamePreferences } from '../model';
import { useStore } from '../store';
import type { GameId, Preferences } from '../model';
import { AppInstallation } from './AppInstallation';
import { catalogTitleLocales, originalTitleLocales } from '../localized-titles';

export function Settings({ onNavigate }: { onNavigate?: () => void }) {
  const { t, locale } = useI18n();
  const { data, preferences, importBackup, exportBackup, notify } = useStore();
  const location = useLocation();
  const routeGame = location.pathname.split('/')[2];
  const [view, setView] = useState('reading');
  const scope: GameId | 'defaults' = games.some((game) => game.id === routeGame)
    ? (routeGame as GameId)
    : 'defaults';
  const p =
    scope === 'defaults'
      ? data.preferences
      : gamePreferences(data.preferences, scope);
  const scoped = (patch: Partial<Preferences>) =>
    scope === 'defaults'
      ? preferences(patch)
      : preferences({
          games: {
            ...data.preferences.games,
            [scope]: { ...data.preferences.games?.[scope], ...patch },
          },
        });
  const currentStory = location.pathname.startsWith('/read/')
    ? episodes.find((episode) => episode.id === location.pathname.split('/')[3])
    : undefined;
  const storyTextLocales = currentStory?.textLocales ?? [];
  const textLocales = currentStory
    ? storyTextLocales
    : scope === 'defaults'
      ? ['en', 'zh-CN', 'ja']
      : [
          ...new Set(
            episodes
              .filter(
                (episode) =>
                  episode.game === scope && episode.origin === 'game',
              )
              .flatMap((episode) => episode.textLocales ?? []),
          ),
        ];
  const localeNames: Record<string, string> = {
    en: 'English',
    'zh-CN': '中文',
    ja: '日本語',
  };
  const languageNames: Record<string, string> = {
    en: 'English',
    'zh-CN': 'Chinese',
    ja: 'Japanese',
  };
  const catalogLocales =
    scope === 'defaults'
      ? new Set(Object.keys(localeNames))
      : catalogTitleLocales(episodes, scope);
  const catalogLocale = p.catalogLocale ?? 'original';
  const catalogLanguageUnavailable =
    catalogLocale !== 'original' && !catalogLocales.has(catalogLocale);
  const storyTitleUnavailable =
    currentStory &&
    catalogLocale !== 'original' &&
    catalogLocale !== originalTitleLocales[currentStory.game] &&
    !currentStory.titleLocales?.[catalogLocale]?.trim();
  const textLanguageUnavailable =
    storyTextLocales.length > 0 && !storyTextLocales.includes(p.textLocale);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const number = (
    key: keyof Preferences,
    label: string,
    min: number,
    max: number,
    step = 1,
    suffix = '',
  ) => (
    <label className="setting">
      <span>
        {t(label)}
        <output>
          {key === 'dialogueOpacity'
            ? Math.round(Number(p[key] ?? 1) * 100)
            : Number(p[key])}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={t(label)}
        min={min}
        max={max}
        step={step}
        value={Number(p[key] ?? 1)}
        onChange={(e) =>
          (key === 'voiceVolume' || key === 'dialogueOpacity'
            ? scoped
            : preferences)({
            [key]: Number(e.target.value),
          })
        }
      />
    </label>
  );
  return (
    <div className="settings-grid">
      <div
        className="settings-navigation"
        role="tablist"
        aria-label={t('Settings sections')}
      >
        {['Reading', 'Appearance', 'Audio', 'Language', 'Library'].map(
          (label) => (
            <button
              key={label}
              id={`settings-tab-${label.toLowerCase()}`}
              role="tab"
              aria-selected={view === label.toLowerCase()}
              aria-controls="settings-panel"
              tabIndex={view === label.toLowerCase() ? 0 : -1}
              onClick={() => setView(label.toLowerCase())}
              onKeyDown={(event) => {
                const tabs = Array.from(
                  event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ),
                );
                const index = tabs.indexOf(event.currentTarget);
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft'
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? tabs.length - 1
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                tabs[next].click();
                tabs[next].focus();
              }}
            >
              {t(label)}
            </button>
          ),
        )}
      </div>
      <div
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${view}`}
      >
        {view === 'reading' ? (
          <>
            <section>
              <h3>{t('Reading')}</h3>
              <label className="setting">
                {t('Layout')}
                <select
                  aria-label={t('Layout')}
                  value={p.layout}
                  onChange={(e) =>
                    preferences({
                      layout: e.target.value as Preferences['layout'],
                      chaptersOpen: e.target.value === 'desk',
                    })
                  }
                >
                  <option value="scene">{t('Scene first')}</option>
                  <option value="desk">{t('Reading desk')}</option>
                  <option value="text">{t('Text only')}</option>
                </select>
              </label>
              {number('fontSize', t('Dialogue size'), 16, 32, 1, ' px')}
              {number('textSpeed', t('Characters per second'), 0, 100)}
              <p className="field-note">
                {t('Set text speed to 0 for instant text.')}
              </p>
              {number('autoDelay', t('Auto reading delay'), 0.5, 10, 0.1, ' s')}
              {number(
                'panelWidth',
                t('Chapter panel width'),
                180,
                360,
                8,
                ' px',
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.waitVoice}
                  onChange={(e) => scoped({ waitVoice: e.target.checked })}
                />
                {t('Wait for voice before auto advance')}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.reducedMotion}
                  onChange={(e) =>
                    preferences({ reducedMotion: e.target.checked })
                  }
                />
                {t('Reduce scene motion')}
              </label>
            </section>
          </>
        ) : null}
        {view === 'appearance' ? (
          <section>
            <h3>{t('Appearance')}</h3>
            {number('dialogueOpacity', t('Dialogue opacity'), 0, 1, 0.05, '%')}
            <label className="setting">
              {t('Appearance')}
              <select
                aria-label={t('Appearance')}
                value={p.theme}
                onChange={(e) =>
                  scoped({ theme: e.target.value as Preferences['theme'] })
                }
              >
                <option value="system">{t('System')}</option>
                <option value="light">{t('Light')}</option>
                <option value="dark">{t('Dark')}</option>
              </select>
            </label>
            {scope !== 'defaults' ? (
              <>
                <label className="setting">
                  {t('Game theme')}
                  <select
                    aria-label={t('Game theme')}
                    value={data.preferences.gameThemes?.[scope] ?? 'default'}
                    onChange={(event) =>
                      preferences({
                        gameThemes: {
                          ...data.preferences.gameThemes,
                          [scope]: event.target.value as GameId | 'default',
                        },
                      })
                    }
                  >
                    <option value="default">Onlystory</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.shortName}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    preferences({
                      games: { ...data.preferences.games, [scope]: {} },
                    })
                  }
                >
                  {t('Use global defaults for this game')}
                </button>
              </>
            ) : null}
          </section>
        ) : null}
        {view === 'language' ? (
          <section>
            <label className="setting">
              {t('App language')}
              <select
                aria-label={t('App language')}
                value={locale}
                onChange={(event) =>
                  preferences({
                    uiLocale: event.target.value as Preferences['uiLocale'],
                  })
                }
              >
                <option value="en">English</option>
                <option value="zh-CN">中文</option>
                <option value="ja">日本語</option>
              </select>
            </label>
            <p className="field-note">
              {t(
                'Applies to the whole app. Catalog titles and dialogue have their own language settings.',
              )}
            </p>
            <h3>
              {scope === 'defaults'
                ? t('Language and player defaults')
                : games.find((game) => game.id === scope)?.name}
            </h3>
            <label className="setting">
              {t('Catalog language')}
              <select
                aria-label={t('Catalog language')}
                aria-describedby="catalog-language-note"
                value={catalogLanguageUnavailable ? 'original' : catalogLocale}
                onChange={(event) =>
                  scoped({
                    catalogLocale: event.target
                      .value as Preferences['catalogLocale'],
                  })
                }
              >
                <option value="original">{t('Original titles')}</option>
                {Object.entries(localeNames)
                  .filter(([locale]) => catalogLocales.has(locale))
                  .map(([locale, name]) => (
                    <option key={locale} value={locale}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-note" id="catalog-language-note">
              {catalogLanguageUnavailable
                ? t(
                    '{language} catalog titles are unavailable for {game}. Showing original titles. ',
                    {
                      language: t(languageNames[catalogLocale]),
                      game: games.find((game) => game.id === scope)?.name ?? '',
                    },
                  )
                : storyTitleUnavailable
                  ? t(
                      '{language} titles are unavailable for this story. Showing its original title. ',
                      { language: t(languageNames[catalogLocale]) },
                    )
                  : ''}
              {t(
                'Event and story titles. Missing translations keep their original titles. This does not change dialogue.',
              )}
            </p>
            <label className="setting">
              {t('Text language')}
              <select
                aria-label={t('Text language')}
                aria-describedby="text-language-note"
                disabled={!textLocales.length}
                value={
                  textLocales.includes(p.textLocale)
                    ? p.textLocale
                    : (textLocales[0] ?? p.textLocale)
                }
                onChange={(e) =>
                  scoped({
                    textLocale: e.target.value as Preferences['textLocale'],
                  })
                }
              >
                {!textLocales.length ? (
                  <option value={p.textLocale}>
                    {t('No text library imported')}
                  </option>
                ) : null}
                {textLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeNames[locale]}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-note" id="text-language-note">
              {textLanguageUnavailable
                ? t(
                    '{language} is unavailable for this story. Showing {fallback}. Your preference is kept for other stories.',
                    {
                      language: t(languageNames[p.textLocale]),
                      fallback: t(languageNames[storyTextLocales[0]]),
                    },
                  )
                : currentStory
                  ? t('Dialogue languages available for this story.')
                  : t(
                      'Preferred dialogue language. Stories without this translation use their original language.',
                    )}
            </p>
            {scope === 'gfl2' ? (
              <label className="setting">
                {t('Protagonist version')}
                <select
                  aria-label={t('Protagonist version')}
                  value={p.textVariant}
                  onChange={(event) =>
                    scoped({
                      textVariant: event.target
                        .value as Preferences['textVariant'],
                    })
                  }
                >
                  <option value="male">{t('Male original')}</option>
                  <option value="female">{t('Female original')}</option>
                </select>
              </label>
            ) : null}
            {scope !== 'pjsk' ? (
              <label className="setting">
                {t('Player name')}
                <input
                  aria-label={t('Player name')}
                  maxLength={40}
                  value={p.playerName}
                  onChange={(event) =>
                    scoped({ playerName: event.target.value })
                  }
                />
              </label>
            ) : null}
            {scope !== 'pjsk' ? (
              <p className="field-note">
                {t(
                  'Player name is used where the source provides a placeholder.',
                )}
              </p>
            ) : null}
          </section>
        ) : null}
        {view === 'audio' ? (
          <section>
            <h3>{t('Audio')}</h3>
            {scope === 'defaults' || scope === 'gfl2' ? (
              <label className="setting">
                {t('Voice language')}
                <select
                  aria-label={t('Voice language')}
                  value={p.voice}
                  onChange={(e) =>
                    scoped({ voice: e.target.value as Preferences['voice'] })
                  }
                >
                  <option value="zh-CN">中文</option>
                  <option value="ja">日本語</option>
                </select>
              </label>
            ) : null}
            <p className="field-note">
              {t(
                'Selects movie audio where available. BA dialogue uses original Japanese voices. Recovered GFL2 regular dialogue has no voice track.',
              )}
            </p>
            {number('musicVolume', t('Music volume'), 0, 1, 0.05)}
            {number('soundVolume', t('Sound effects volume'), 0, 1, 0.05)}
            {number('voiceVolume', t('Voice volume'), 0, 1, 0.05)}
          </section>
        ) : null}
        {view === 'library' ? (
          <section>
            <h3>{t('Library')}</h3>
            <label className="setting">
              {t('Source')}
              <select
                aria-label={t('Source')}
                value={p.source}
                onChange={(e) =>
                  preferences({
                    source: e.target.value as Preferences['source'],
                  })
                }
              >
                <option value="device">{t('On this device')}</option>
                <option value="server-preview">
                  {t('Private server preview')}
                </option>
              </select>
            </label>
            {p.source === 'server-preview' ? (
              <p className="field-note">
                {t(
                  'This previews server availability states. No server or account is connected.',
                )}
              </p>
            ) : null}
            <Link className="text-link" to="/manage" onClick={onNavigate}>
              {t('Manage episode downloads')}
            </Link>
          </section>
        ) : null}
        {view === 'library' ? (
          <section>
            <h3>{t('Your data')}</h3>
            <p className="field-note">
              {t(
                'Export progress, branches, bookmarks and preferences. Restoring merges with your current records.',
              )}
            </p>
            <div className="button-row">
              <button onClick={exportBackup}>
                <Download size={16} />
                {t('Export backup')}
              </button>
              <button onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                {t('Restore backup')}
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await importBackup(file);
                  setError('');
                } catch (reason) {
                  const message =
                    reason instanceof Error
                      ? reason.message
                      : t('The backup could not be read.');
                  setError(message);
                  notify(message);
                }
                e.target.value = '';
              }}
            />
            {error ? (
              <p role="alert" className="error-text">
                {error}
              </p>
            ) : null}
          </section>
        ) : null}
        {view === 'library' ? (
          <section>
            <h3>{t('About this build')}</h3>
            <p className="field-note">
              {t(
                'Private local build. GFL1, GFL2, Project SEKAI and Blue Archive use the shared reader with original imported text and media. Source gaps and presentation limits are disclosed in the reader. Fictional interface fixtures are under design checks.',
              )}
            </p>
            <Link className="text-link" to="/lab" onClick={onNavigate}>
              {t('Cross-game design checks')}
            </Link>
          </section>
        ) : null}
        {view === 'library' ? <AppInstallation /> : null}
      </div>
    </div>
  );
}
