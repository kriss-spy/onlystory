import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Preferences } from '../model';

export function Settings({ onNavigate }: { onNavigate?: () => void }) {
  const { data, preferences, importBackup, exportBackup, notify } = useStore();
  const p = data.preferences;
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
          {p[key]}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Number(p[key])}
        onChange={(e) => preferences({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="settings-grid">
      <section>
        <h3>Reading</h3>
        <label className="setting">
          Appearance
          <select
            aria-label="Appearance"
            value={p.theme}
            onChange={(e) =>
              preferences({ theme: e.target.value as Preferences['theme'] })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
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
        <p className="field-note">Set text speed to 0 for instant text.</p>
        {number('autoDelay', 'Auto reading delay', 0.5, 10, 0.1, ' s')}
        {number('panelWidth', 'Chapter panel width', 180, 360, 8, ' px')}
        <label className="check">
          <input
            type="checkbox"
            checked={p.waitVoice}
            onChange={(e) => preferences({ waitVoice: e.target.checked })}
          />
          Wait for voice before auto advance
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={p.reducedMotion}
            onChange={(e) => preferences({ reducedMotion: e.target.checked })}
          />
          Reduce scene motion
        </label>
      </section>
      <section>
        <h3>Original text variants</h3>
        <label className="setting">
          Text language
          <select
            aria-label="Text language"
            value={p.textLocale}
            onChange={(e) =>
              preferences({
                textLocale: e.target.value as Preferences['textLocale'],
              })
            }
          >
            <option value="en">English</option>
            <option value="zh-CN">中文</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label className="setting">
          Protagonist version
          <select
            aria-label="Protagonist version"
            value={p.textVariant}
            onChange={(event) =>
              preferences({
                textVariant: event.target.value as Preferences['textVariant'],
              })
            }
          >
            <option value="male">Male original</option>
            <option value="female">Female original</option>
          </select>
        </label>
        <label className="setting">
          Player name
          <input
            aria-label="Player name"
            maxLength={40}
            value={p.playerName}
            onChange={(event) =>
              preferences({ playerName: event.target.value })
            }
          />
        </label>
        <p className="field-note">
          Used where the source provides alternate text or a player-name
          placeholder. Chapters without a selected translation keep their source
          language. The current BA library has Japanese text only.
        </p>
      </section>
      <section>
        <h3>Audio</h3>
        <label className="setting">
          Voice language
          <select
            aria-label="Voice language"
            value={p.voice}
            onChange={(e) =>
              preferences({ voice: e.target.value as Preferences['voice'] })
            }
          >
            <option value="zh-CN">中文</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <p className="field-note">
          Selects movie audio where available. BA dialogue uses original
          Japanese voices. Recovered GFL2 regular dialogue has no voice track.
        </p>
        {number('musicVolume', 'Music volume', 0, 1, 0.05)}
        {number('soundVolume', 'Sound effects volume', 0, 1, 0.05)}
        {number('voiceVolume', 'Voice volume', 0, 1, 0.05)}
      </section>
      <section>
        <h3>Library</h3>
        <label className="setting">
          Source
          <select
            aria-label="Source"
            value={p.source}
            onChange={(e) =>
              preferences({ source: e.target.value as Preferences['source'] })
            }
          >
            <option value="device">On this device</option>
            <option value="server-preview">Private server preview</option>
          </select>
        </label>
        {p.source === 'server-preview' ? (
          <p className="field-note">
            This previews server availability states. No server or account is
            connected.
          </p>
        ) : null}
        <Link className="text-link" to="/manage" onClick={onNavigate}>
          Manage episode downloads
        </Link>
      </section>
      <section>
        <h3>Your data</h3>
        <p className="field-note">
          Export progress, branches, bookmarks and preferences. Restoring merges
          with your current records.
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
      <section>
        <h3>About this build</h3>
        <p className="field-note">
          Private local build. GFL2 has recovered scenes and text. Blue Archive
          has the JP prologue and five event collections with original visuals
          and audio. Fictional interface fixtures are under design checks.
        </p>
        <Link className="text-link" to="/lab" onClick={onNavigate}>
          Cross-game design checks
        </Link>
      </section>
    </div>
  );
}
