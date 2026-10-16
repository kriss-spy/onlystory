import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { emptyData, mergeData, parseData } from './model';
import type {
  AppData,
  Bookmark,
  Episode,
  Preferences,
  ReadingSave,
} from './model';
import {
  downloadAsset,
  selectedSceneFiles,
  migrateMediaCache,
  matchMedia,
} from './media-storage';

export const STORAGE_KEY = 'onlystory.v1';
const CACHE_NAME = 'onlystory.media.v1';
export const isInstalled = (data: AppData, episode: Episode) => {
  const installation = data.installations?.[episode.id];
  return (
    data.installed[episode.id] === true &&
    (!installation ||
      (installation.voices.includes(data.preferences.voice) &&
        (!installation.variants ||
          installation.variants.includes(
            `${data.preferences.textVariant}:${data.preferences.voice}`,
          ))))
  );
};
interface Notice {
  message: string;
  action?: { label: string; run: () => void };
}
export interface Transfer {
  episodeId: string;
  status: 'downloading' | 'complete' | 'failed' | 'canceled';
  bytes: number;
  total: number;
  error?: string;
}
interface Store {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  preferences: (patch: Partial<Preferences>) => void;
  save: (save: ReadingSave) => void;
  bookmark: (episode: Episode, save: ReadingSave, label: string) => void;
  notify: (message: string, action?: Notice['action']) => void;
  notice: Notice | null;
  dismiss: () => void;
  transfers: Record<string, Transfer>;
  download: (episode: Episode) => void;
  cancel: (id: string) => void;
  remove: (episode: Episode | Episode[]) => void;
  importBackup: (file: File) => Promise<void>;
  exportBackup: () => void;
}
let initialProblem = '';
let preserveUnreadableStorage = false;
function load(): AppData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseData(JSON.parse(raw)) : emptyData();
  } catch {
    initialProblem =
      'Browser storage could not be read. Progress will only last for this session unless you export a backup.';
    if (raw) {
      try {
        localStorage.setItem('onlystory.recovery', raw);
        initialProblem =
          'Saved data could not be read. The original was preserved in onlystory.recovery in browser storage.';
      } catch {
        preserveUnreadableStorage = true;
        initialProblem =
          'Saved data is unreadable and could not be backed up. The original has been kept. Browser storage may be full or disabled.';
      }
    }
    return emptyData();
  }
}
const Context = createContext<Store | null>(null);
const controllers = new Map<string, AbortController>();
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const latestData = useRef(data);
  latestData.current = data;
  const [notice, setNotice] = useState<Notice | null>(() =>
    initialProblem ? { message: initialProblem } : null,
  );
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const notify = useCallback((message: string, action?: Notice['action']) => {
    setNotice({ message, action });
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!('caches' in window)) return;
      await migrateMediaCache().catch(() => {});
      const cache = await caches.open(CACHE_NAME);
      const missing: string[] = [];
      for (const [id, installation] of Object.entries(
        latestData.current.installations ?? {},
      )) {
        if (!latestData.current.installed[id]) continue;
        for (const url of installation.files)
          if (!(await matchMedia(cache, url))) {
            missing.push(id);
            break;
          }
      }
      if (active && missing.length)
        setData((old) => ({
          ...old,
          installed: {
            ...old.installed,
            ...Object.fromEntries(missing.map((id) => [id, false])),
          },
        }));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (preserveUnreadableStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      notify(
        'Local storage is unavailable or full. Export your progress before leaving.',
      );
    }
  }, [data, notify]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setData(parseData(JSON.parse(event.newValue)));
      } catch {
        notify(
          'Another tab wrote unreadable progress. This tab has kept its current state.',
        );
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [notify]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.preferences.theme;
    root.style.colorScheme =
      data.preferences.theme === 'system'
        ? 'light dark'
        : data.preferences.theme;
    root.dataset.motion = data.preferences.reducedMotion ? 'reduced' : 'normal';
  }, [data.preferences.theme, data.preferences.reducedMotion]);
  const preferences = useCallback(
    (patch: Partial<Preferences>) =>
      setData((old) => ({
        ...old,
        preferences: { ...old.preferences, ...patch },
      })),
    [],
  );
  const save = useCallback(
    (value: ReadingSave) =>
      setData((old) => ({
        ...old,
        saves: { ...old.saves, [value.episodeId]: value },
      })),
    [],
  );
  const bookmark = useCallback(
    (episode: Episode, snapshot: ReadingSave, label: string) => {
      const id = `${episode.id}:${snapshot.frames.at(-1)!.node}:${JSON.stringify(snapshot.frames.at(-1)!.answers)}`;
      setData((old) => {
        const existing = old.bookmarks.find((b) => b.id === id);
        return {
          ...old,
          bookmarks: existing
            ? old.bookmarks.filter((b) => b.id !== id)
            : [
                ...old.bookmarks,
                {
                  id,
                  episodeId: episode.id,
                  snapshot: structuredClone(snapshot),
                  label,
                  createdAt: new Date().toISOString(),
                } satisfies Bookmark,
              ],
        };
      });
    },
    [],
  );
  const download = useCallback(
    (episode: Episode) => {
      if (controllers.has(episode.id)) return;
      const controller = new AbortController();
      const voice = latestData.current.preferences.voice;
      const gender = latestData.current.preferences.textVariant;
      controllers.set(episode.id, controller);
      setTransfers((old) => ({
        ...old,
        [episode.id]: {
          episodeId: episode.id,
          status: 'downloading',
          bytes: 0,
          total: 0,
        },
      }));
      void (async () => {
        let bytes = 0;
        let total = 0;
        try {
          if (!('caches' in window))
            throw new Error(
              'Downloads need a secure browser context. Use localhost or HTTPS.',
            );
          const cache = await caches.open(CACHE_NAME);
          if (episode.content?.sceneUrl) {
            const { preloadScene } =
              await import('./playback/gfl2/Gfl2EventScene');
            await preloadScene();
          }
          void navigator.storage?.persist?.().catch(() => false);
          const initialProgram =
            episode.renderer?.id === 'gfl2-event'
              ? (episode.renderer
                  .payload as import('./playback/gfl2/event-types').EventProgram)
              : undefined;
          const allowed = initialProgram
            ? new Set(selectedSceneFiles(initialProgram, voice, gender))
            : undefined;
          const inventory = new Set(
            initialProgram?.files.map((file) => file.url),
          );
          const paths = [...new Set(episode.assets)].filter(
            (url) => !inventory.has(url) || allowed?.has(url),
          );
          const queued = new Set(paths);
          let hasMovie = Object.keys(initialProgram?.videos ?? {}).length > 0;
          let hasGenderMovie = Object.values(initialProgram?.videos ?? {}).some(
            (movie) => movie.female,
          );
          let lastProgressAt = 0;
          for (const path of paths) {
            controller.signal.throwIfAborted();
            const completed = bytes;
            const size = await downloadAsset(
              cache,
              path,
              controller.signal,
              (received, length) => {
                // Stream chunks must not redraw the entire download catalog.
                // File boundaries and completion still publish immediately.
                const now = performance.now();
                if (now - lastProgressAt < 100 && received !== length) return;
                lastProgressAt = now;
                setTransfers((old) => ({
                  ...old,
                  [episode.id]: {
                    episodeId: episode.id,
                    status: 'downloading',
                    bytes: completed + received,
                    total: total + length,
                  },
                }));
              },
            );
            bytes += size;
            total += size;
            if (path === episode.content?.sceneUrl) {
              const response = await cache.match(path);
              const program = await response?.json();
              if (
                program?.version !== 1 ||
                program.id !== episode.id ||
                !Array.isArray(program.files)
              )
                throw new Error(
                  'This chapter has an invalid scene package. Reimport it before downloading.',
                );
              hasMovie = Object.keys(program.videos ?? {}).length > 0;
              hasGenderMovie = Object.values(program.videos ?? {}).some(
                (movie: any) => movie.female,
              );
              const selected = new Set(
                selectedSceneFiles(program, voice, gender),
              );
              for (const file of program.files) {
                if (
                  typeof file.url !== 'string' ||
                  !file.url.startsWith('/') ||
                  file.url.startsWith('//')
                )
                  throw new Error(
                    'The scene package contains an invalid media path.',
                  );
                if (selected.has(file.url) && !queued.has(file.url)) {
                  queued.add(file.url);
                  paths.push(file.url);
                }
              }
            }
            setTransfers((old) => ({
              ...old,
              [episode.id]: {
                episodeId: episode.id,
                status: 'downloading',
                bytes,
                total,
              },
            }));
          }
          controller.signal.throwIfAborted();
          setData((old) => ({
            ...old,
            installed: { ...old.installed, [episode.id]: true },
            installations: {
              ...old.installations,
              [episode.id]: {
                files: [
                  ...new Set([
                    ...(old.installations?.[episode.id]?.files ?? []),
                    ...paths,
                  ]),
                ],
                voices: hasMovie
                  ? [
                      ...new Set([
                        ...(old.installations?.[episode.id]?.voices ?? []),
                        voice,
                      ]),
                    ]
                  : ['zh-CN', 'ja'],
                variants: [
                  ...new Set([
                    ...(old.installations?.[episode.id]?.variants ?? []),
                    ...(hasGenderMovie ? [gender] : ['male', 'female']).flatMap(
                      (variant) =>
                        (hasMovie ? [voice] : ['zh-CN', 'ja']).map(
                          (language) => `${variant}:${language}`,
                        ),
                    ),
                  ]),
                ],
              },
            },
          }));
          setTransfers((old) => ({
            ...old,
            [episode.id]: {
              episodeId: episode.id,
              status: 'complete',
              bytes,
              total,
            },
          }));
          notify(`“${episode.title}” is available on this device.`);
        } catch (error) {
          setTransfers((old) => ({
            ...old,
            [episode.id]: {
              episodeId: episode.id,
              status: controller.signal.aborted ? 'canceled' : 'failed',
              bytes,
              total,
              error:
                error instanceof Error ? error.message : 'Download failed.',
            },
          }));
        } finally {
          controllers.delete(episode.id);
        }
      })();
    },
    [notify],
  );
  const cancel = useCallback((id: string) => controllers.get(id)?.abort(), []);
  const remove = useCallback(
    (input: Episode | Episode[]) => {
      const items = Array.isArray(input) ? input : [input];
      const previous = Object.fromEntries(
        items.map((episode) => [
          episode.id,
          data.installed[episode.id] === true,
        ]),
      );
      setData((old) => ({
        ...old,
        installed: {
          ...old.installed,
          ...Object.fromEntries(items.map((episode) => [episode.id, false])),
        },
      }));
      notify(
        items.length === 1
          ? 'Episode removed. Your progress and bookmarks are kept.'
          : `${items.length} episodes removed. Your progress and bookmarks are kept.`,
        {
          label: 'Undo',
          run: () =>
            setData((old) => ({
              ...old,
              installed: { ...old.installed, ...previous },
            })),
        },
      );
    },
    [notify, data.installed, data.installations],
  );
  const importBackup = useCallback(
    async (file: File) => {
      if (file.size > 10_000_000)
        throw new Error(
          'This backup is too large. Choose a file smaller than 10 MB.',
        );
      const imported = parseData(JSON.parse(await file.text()));
      setData((old) => mergeData(old, imported));
      notify('Backup merged. Newer progress and device downloads were kept.');
    },
    [notify],
  );
  const exportBackup = useCallback(() => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onlystory-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data]);
  const value = useMemo<Store>(
    () => ({
      data,
      setData,
      preferences,
      save,
      bookmark,
      notify,
      notice,
      dismiss: () => setNotice(null),
      transfers,
      download,
      cancel,
      remove,
      importBackup,
      exportBackup,
    }),
    [
      data,
      preferences,
      save,
      bookmark,
      notify,
      notice,
      transfers,
      download,
      cancel,
      remove,
      importBackup,
      exportBackup,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error('Onlystory needs its AppProvider.');
  return value;
}
