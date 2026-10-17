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

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { notice, dismiss, transfers } = useStore();
  const [panel, setPanel] = useState<GlobalPanel | null>(null);
  const [query, setQuery] = useState('');
  const focus = useRef<HTMLElement | null>(null);
  const inReader = location.pathname.startsWith('/read/');
  const open = useCallback((name: GlobalPanel) => {
    focus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery('');
    setPanel(name);
  }, []);
  const close = useCallback(() => setPanel(null), []);
  const active = Object.values(transfers).filter(
    (t) => t.status === 'downloading',
  ).length;
  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      const dialog = document.querySelector('[role="dialog"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (!dialog) {
          event.preventDefault();
          open('commands');
        }
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        dialog ||
        (event.target as HTMLElement).closest(
          'input,select,textarea,[contenteditable="true"],video',
        ) ||
        window.getSelection()?.toString()
      )
        return;
      if (event.key === ',') {
        event.preventDefault();
        open('settings');
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
        h: 'history',
        b: 'bookmark',
        c: 'chapters',
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
    () => [
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
        label: 'Manage downloads',
        icon: Download,
        run: () => navigate('/manage'),
        shortcut: '',
      },
      {
        label: 'Reader settings',
        icon: Settings2,
        run: () => open('settings'),
        shortcut: ',',
      },
      ...(inReader
        ? (
            [
              ['Chapters', PanelLeft, 'chapters', 'C'],
              ['History', History, 'history', 'H'],
              ['Save points', Save, 'saves', ''],
              ['Bookmark passage', Bookmark, 'bookmark', 'B'],
              ['Auto reading', Play, 'auto', 'A'],
              ['Fast-forward', SkipForward, 'skip', 'F'],
              ['Hide controls', EyeOff, 'hide', 'U'],
              ['Fullscreen', Maximize, 'fullscreen', ''],
              ['Available transcript', BookOpen, 'transcript', ''],
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
    ],
    [inReader, navigate, open],
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
            <nav aria-label="Main navigation">
              <NavLink aria-label="Library" to="/library">
                <Library size={18} />
              </NavLink>
              <NavLink aria-label="Bookmarks" to="/bookmarks">
                <Bookmark size={18} />
              </NavLink>
              <NavLink
                aria-label="Manage downloads"
                to="/manage"
                className="download-nav"
              >
                <Download size={18} />
                {active ? <span className="nav-count">{active}</span> : null}
              </NavLink>
              <IconButton
                label="Commands & shortcuts"
                shortcut="Ctrl+K"
                onClick={() => open('commands')}
              >
                <Command size={18} />
              </IconButton>
              <IconButton
                label="Settings"
                shortcut=","
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
            <span>{notice.message}</span>
            {notice.action ? (
              <button
                onClick={() => {
                  notice.action?.run();
                  dismiss();
                }}
              >
                {notice.action.label}
              </button>
            ) : null}
            <IconButton label="Dismiss notification" onClick={dismiss}>
              <X size={15} />
            </IconButton>
          </div>
        ) : null}
        <Panel
          open={panel === 'settings'}
          onClose={close}
          title="Settings"
          description="Preferences are saved on this device."
          returnFocus={focus.current}
        >
          <Settings onNavigate={close} />
        </Panel>
        <Panel
          open={panel === 'commands'}
          onClose={close}
          title="Commands & shortcuts"
          returnFocus={focus.current}
          variant="palette"
        >
          <label className="search-field">
            <Command size={17} />
            <input
              autoFocus
              aria-label="Find a command"
              placeholder="Find a command…"
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
              <p className="field-note">No matching commands.</p>
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
  return (
    <header className="page-title">
      {back ? (
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} />
          Back
        </Link>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {children}
    </header>
  );
}
