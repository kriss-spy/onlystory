import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronRight,
  Command,
  Download,
  FlaskConical,
  History,
  Library,
  PanelLeft,
  Play,
  Settings2,
  SkipForward,
  EyeOff,
  X,
  ArrowLeft,
  Maximize,
  Save,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { readerCommand, UiContext } from '../ui';
import type { GlobalPanel, ReaderCommand } from '../ui';
import { IconButton, Panel } from './Primitives';
import { Settings } from './Settings';
import {
  DownloadSelectionProvider,
  DownloadSelectionButton,
  useDownloadSelection,
} from './DownloadSelection';
import type { GameId } from '../model';
import { gamePreferences } from '../model';
import { useI18n } from '../i18n';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <DownloadSelectionProvider>
      <ShellContent>{children}</ShellContent>
    </DownloadSelectionProvider>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const selection = useDownloadSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const { notice, dismiss, data } = useStore();
  const [panel, setPanel] = useState<GlobalPanel | null>(null);
  const [query, setQuery] = useState('');
  const focus = useRef<HTMLElement | null>(null);
  const inReader = location.pathname.startsWith('/read/');
  const game = location.pathname.split('/')[2] as GameId;
  const palette = data.preferences.gameThemes?.[game] ?? 'default';
  const theme = gamePreferences(data.preferences, game).theme;
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === 'system' ? 'light dark' : theme;
    return () => {
      delete document.documentElement.dataset.palette;
    };
  }, [palette, theme]);
  const open = useCallback((name: GlobalPanel) => {
    focus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery('');
    setPanel(name);
  }, []);
  const close = useCallback(() => setPanel(null), []);
  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      const dialog = document.querySelector('[role="dialog"]');
      if (
        inReader &&
        event.key === 'F11' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (!dialog && !event.repeat) readerCommand('fullscreen');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (!dialog) {
          event.preventDefault();
          open('commands');
        }
        return;
      }
      const editing = (event.target as HTMLElement).closest(
        'input,select,textarea,[contenteditable="true"],video',
      );
      if (
        event.altKey ||
        dialog ||
        editing ||
        window.getSelection()?.toString()
      )
        return;
      if (event.ctrlKey || event.metaKey) {
        if (event.shiftKey || event.repeat) return;
        if (event.key === ',') {
          event.preventDefault();
          open('settings');
        } else if (inReader) {
          const command = (
            { c: 'chapters', h: 'history', s: 'checkpoint' } as const
          )[event.key.toLowerCase() as 'c' | 'h' | 's'];
          if (command) {
            event.preventDefault();
            readerCommand(command);
          }
        }
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        open('commands');
        return;
      }
      if (!inReader) return;
      const map: Record<string, ReaderCommand> = {
        ArrowLeft: 'previous',
        ArrowRight: 'next',
        a: 'auto',
        f: 'skip',
        b: 'bookmark',
        c: 'language-zh-CN',
        j: 'language-ja',
        e: 'language-en',
        u: 'hide',
      };
      const command =
        map[event.key.toLowerCase()] ??
        map[event.key] ??
        (event.code === 'Space' &&
        !(event.target as HTMLElement).closest('button,a')
          ? 'next'
          : undefined);
      if (command) {
        event.preventDefault();
        readerCommand(
          command === 'next' && event.repeat ? 'next-repeat' : command,
        );
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [inReader, open]);
  const commands = useMemo(
    () =>
      [
        {
          label: 'Library',
          icon: Library,
          run: () => navigate('/library'),
          shortcut: '',
        },
        {
          label: 'Bookmarks',
          icon: Bookmark,
          run: () => navigate('/bookmarks'),
          shortcut: '',
        },
        {
          label: 'Select stories to download',
          icon: Download,
          run: selection.press,
          shortcut: '',
        },
        {
          label: inReader ? 'Reader settings' : 'General settings',
          icon: Settings2,
          run: () => open('settings'),
          shortcut: 'Ctrl+,',
        },
        ...(inReader
          ? (
              [
                ['Chapters', PanelLeft, 'chapters', 'Ctrl+C'],
                ['History', History, 'history', 'Ctrl+H'],
                ['Save checkpoint', Save, 'checkpoint', 'Ctrl+S'],
                ['Save points', Save, 'saves', ''],
                ['Bookmark passage', Bookmark, 'bookmark', 'B'],
                ['Auto reading', Play, 'auto', 'A'],
                ['Fast-forward', SkipForward, 'skip', 'F'],
                ['Hide controls', EyeOff, 'hide', 'U'],
                ['Maximize reader', Maximize, 'fullscreen', 'F11'],
              ] as const
            ).map(([label, icon, command, shortcut]) => ({
              label,
              icon,
              run: () => readerCommand(command),
              shortcut,
            }))
          : []),
        {
          label: 'Cross-game design checks',
          icon: FlaskConical,
          run: () => navigate('/lab'),
          shortcut: '',
        },
      ].map((command) => ({ ...command, label: t(command.label) })),
    [inReader, navigate, open, selection.press, t],
  );
  const filtered = commands.filter((c) => {
    let i = 0;
    const q = query.toLowerCase().replaceAll(' ', '');
    for (const ch of c.label.toLowerCase()) if (ch === q[i]) i++;
    return i === q.length;
  });
  return (
    <UiContext.Provider value={{ open, active: panel }}>
      <div className={`app-shell ${inReader ? 'reading-shell' : ''}`}>
        {!inReader ? (
          <header className="app-header">
            <Link className="brand" to="/library">
              <BookOpen size={21} strokeWidth={1.5} />
              <span>onlystory</span>
            </Link>
            <nav aria-label={t('Main navigation')}>
              <NavLink aria-label={t('Library')} to="/library">
                <Library size={18} />
              </NavLink>
              <NavLink aria-label={t('Bookmarks')} to="/bookmarks">
                <Bookmark size={18} />
              </NavLink>
              <DownloadSelectionButton />
              <IconButton
                label={t('Commands & shortcuts')}
                shortcut="Ctrl+K"
                onClick={() => open('commands')}
              >
                <Command size={18} />
              </IconButton>
              <IconButton
                label={t('Settings')}
                shortcut="Ctrl+,"
                onClick={() => open('settings')}
              >
                <Settings2 size={18} />
              </IconButton>
            </nav>
          </header>
        ) : null}
        {children}
        {notice ? (
          <div className="toast" role="status">
            <span>{t(notice.message)}</span>
            {notice.action ? (
              <button
                onClick={() => {
                  notice.action?.run();
                  dismiss();
                }}
              >
                {t(notice.action.label)}
              </button>
            ) : null}
            <IconButton label={t('Dismiss notification')} onClick={dismiss}>
              <X size={15} />
            </IconButton>
          </div>
        ) : null}
        <Panel
          open={panel === 'settings'}
          onClose={close}
          title={t('Settings')}
          description={t('Preferences are saved on this device.')}
          returnFocus={focus.current}
        >
          <Settings key={location.pathname} onNavigate={close} />
        </Panel>
        <Panel
          open={panel === 'commands'}
          onClose={close}
          title={t('Commands & shortcuts')}
          returnFocus={focus.current}
          variant="palette"
        >
          <label className="search-field">
            <Command size={17} />
            <input
              autoFocus
              aria-label={t('Find a command')}
              placeholder={t('Find a command…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="command-list">
            {filtered.map((c) => (
              <button
                key={c.label}
                onClick={() => {
                  close();
                  setTimeout(c.run, 0);
                }}
              >
                <span>
                  <c.icon size={17} />
                  {c.label}
                </span>
                {c.shortcut ? (
                  <kbd>{c.shortcut}</kbd>
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            ))}
            {!filtered.length ? (
              <p className="field-note">{t('No matching commands.')}</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </UiContext.Provider>
  );
}

export function PageTitle({
  eyebrow,
  title,
  children,
  back,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  back?: string;
}) {
  const { t } = useI18n();
  return (
    <header className="page-title">
      {back ? (
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} />
          {t('Back')}
        </Link>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {children}
    </header>
  );
}
