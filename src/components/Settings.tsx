import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { games, episodes } from '../content';
import { gamePreferences } from '../model';
import { useStore } from '../store';
import type { GameId, Preferences } from '../model';
import { AppInstallation } from './AppInstallation';

export function Settings({ onNavigate }: { onNavigate?: () => void }) {
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
  const textLocales =
    scope === 'defaults'
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
        {label}
        <output>
          {key === 'dialogueOpacity'
            ? Math.round(Number(p[key] ?? 1) * 100)
            : Number(p[key])}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
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
        aria-label="Settings sections"
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
              {label}
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
              <h3>Reading</h3>
              <label className="setting">
                Layout
                <select
                  aria-label="Layout"
                  value={p.layout}
                  onChange={(e) =>
                    preferences({
                      layout: e.target.value as Preferences['layout'],
                      chaptersOpen: e.target.value === 'desk',
                    })
                  }
                >
                  <option value="scene">Scene first</option>
                  <option value="desk">Reading desk</option>
                  <option value="text">Text only</option>
                </select>
              </label>
              {number('fontSize', 'Dialogue size', 16, 32, 1, ' px')}
              {number('textSpeed', 'Characters per second', 0, 100)}
              <p className="field-note">
                Set text speed to 0 for instant text.
              </p>
              {number('autoDelay', 'Auto reading delay', 0.5, 10, 0.1, ' s')}
              {number('panelWidth', 'Chapter panel width', 180, 360, 8, ' px')}
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.waitVoice}
                  onChange={(e) => scoped({ waitVoice: e.target.checked })}
                />
                Wait for voice before auto advance
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.reducedMotion}
                  onChange={(e) =>
                    preferences({ reducedMotion: e.target.checked })
                  }
                />
                Reduce scene motion
              </label>
            </section>
          </>
        ) : null}
        {view === 'appearance' ? (
          <section>
            <h3>Appearance</h3>
            {number('dialogueOpacity', 'Dialogue opacity', 0, 1, 0.05, '%')}
            <label className="setting">
              Appearance
              <select
                aria-label="Appearance"
                value={p.theme}
                onChange={(e) =>
                  scoped({ theme: e.target.value as Preferences['theme'] })
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            {scope !== 'defaults' ? (
              <>
                <label className="setting">
                  Game theme
                  <select
                    aria-label="Game theme"
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
                  Use global defaults for this game
                </button>
              </>
            ) : null}
          </section>
        ) : null}
        {view === 'language' ? (
          <section>
            <h3>
              {scope === 'defaults'
                ? 'Language and player defaults'
                : games.find((game) => game.id === scope)?.name}
            </h3>
            <label className="setting">
              Text language
              <select
                aria-label="Text language"
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
                  <option value={p.textLocale}>No text library imported</option>
                ) : null}
                {textLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeNames[locale]}
                  </option>
                ))}
              </select>
            </label>
            {scope === 'gfl2' ? (
              <label className="setting">
                Protagonist version
                <select
                  aria-label="Protagonist version"
                  value={p.textVariant}
                  onChange={(event) =>
                    scoped({
                      textVariant: event.target
                        .value as Preferences['textVariant'],
                    })
                  }
                >
                  <option value="male">Male original</option>
                  <option value="female">Female original</option>
                </select>
              </label>
            ) : null}
            {scope !== 'pjsk' ? (
              <label className="setting">
                Player name
                <input
                  aria-label="Player name"
                  maxLength={40}
                  value={p.playerName}
                  onChange={(event) =>
                    scoped({ playerName: event.target.value })
                  }
                />
              </label>
            ) : null}
            <p className="field-note">
              Used where the source provides alternate text or a player-name
              placeholder. Chapters without a selected translation keep their
              source language. The current BA library has Japanese text only.
            </p>
          </section>
        ) : null}
        {view === 'audio' ? (
          <section>
            <h3>Audio</h3>
            {scope === 'defaults' || scope === 'gfl2' ? (
              <label className="setting">
                Voice language
                <select
                  aria-label="Voice language"
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
              Selects movie audio where available. BA dialogue uses original
              Japanese voices. Recovered GFL2 regular dialogue has no voice
              track.
            </p>
            {number('musicVolume', 'Music volume', 0, 1, 0.05)}
            {number('soundVolume', 'Sound effects volume', 0, 1, 0.05)}
            {number('voiceVolume', 'Voice volume', 0, 1, 0.05)}
          </section>
        ) : null}
        {view === 'library' ? (
          <section>
            <h3>Library</h3>
            <label className="setting">
              Source
              <select
                aria-label="Source"
                value={p.source}
                onChange={(e) =>
                  preferences({
                    source: e.target.value as Preferences['source'],
                  })
                }
              >
                <option value="device">On this device</option>
                <option value="server-preview">Private server preview</option>
              </select>
            </label>
            {p.source === 'server-preview' ? (
              <p className="field-note">
                This previews server availability states. No server or account
                is connected.
              </p>
            ) : null}
            <Link className="text-link" to="/manage" onClick={onNavigate}>
              Manage episode downloads
            </Link>
          </section>
        ) : null}
        {view === 'library' ? (
          <section>
            <h3>Your data</h3>
            <p className="field-note">
              Export progress, branches, bookmarks and preferences. Restoring
              merges with your current records.
            </p>
            <div className="button-row">
              <button onClick={exportBackup}>
                <Download size={16} />
                Export backup
              </button>
              <button onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                Restore backup
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
                      : 'The backup could not be read.';
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
            <h3>About this build</h3>
            <p className="field-note">
              Private local build. GFL1, GFL2, Project SEKAI and Blue Archive
              use the shared reader with original imported text and media.
              Source gaps and presentation limits are disclosed in the reader.
              Fictional interface fixtures are under design checks.
            </p>
            <Link className="text-link" to="/lab" onClick={onNavigate}>
              Cross-game design checks
            </Link>
          </section>
        ) : null}
        {view === 'library' ? <AppInstallation /> : null}
      </div>
    </div>
  );
}
