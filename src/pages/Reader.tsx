import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gfl1Effects } from '../playback/gfl1/Gfl1Effects';
import { Gfl1Interaction } from '../playback/gfl1/Gfl1Interaction';
import type { Gfl1Program } from '../playback/gfl1/story';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Command,
  Download,
  Eye,
  EyeOff,
  History,
  Maximize,
  PanelLeft,
  Pause,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SkipForward,
  Trash2,
  Volume2,
  Info,
} from 'lucide-react';
import {
  episodeById,
  eventForEpisode,
  gameById,
  loadEpisode,
} from '../content';
import { eventUrl, nextStory, storySections } from '../catalog';
import {
  advance,
  canFastForward,
  markSeen,
  nodeOf,
  passageUrl,
  restorePassage,
  resumeSave,
  rewind,
  startSave,
  passageText,
  localizedText,
  readingPath,
} from '../model';
import type {
  Bookmark as SavedPoint,
  Fixture,
  Frame,
  ReadingSave,
} from '../model';
import { useMediaUrl, useNarrow, useOnline } from '../hooks';
import { isInstalled, useStore } from '../store';
import { useUi } from '../ui';
import type { ReaderCommand } from '../ui';
import { EmptyState, IconButton, Panel } from '../components/Primitives';
import { SceneHost } from '../components/SceneHost';
import { StoryProgress } from '../components/StoryProgress';

type ReaderPanel =
  'history' | 'chapters' | 'saves' | 'transcript' | 'information';
type FastForwardControl = {
  skipping: boolean;
  setSkipping: Dispatch<SetStateAction<boolean>>;
};
export function ReaderRoute() {
  const [skipping, setSkipping] = useState(false);
  const { game, episode: id } = useParams();
  const episode = episodeById(id);
  if (!episode || episode.game !== game)
    return (
      <main className="page">
        <EmptyState
          title="Episode not found"
          action={<Link to="/library">Return to library</Link>}
        >
          This link does not match an episode in your library.
        </EmptyState>
      </main>
    );
  return (
    <EpisodeReader
      key={episode.id}
      episode={episode}
      skipping={skipping}
      setSkipping={setSkipping}
    />
  );
}

function EpisodeReader({
  episode,
  skipping,
  setSkipping,
}: {
  episode: NonNullable<ReturnType<typeof episodeById>>;
} & FastForwardControl) {
  const [loaded, setLoaded] = useState(episode.content ? null : episode);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!episode.content) return;
    let active = true;
    setError('');
    void loadEpisode(episode)
      .then((value) => {
        if (active) setLoaded(value);
      })
      .catch((reason) => {
        if (active) {
          setSkipping(false);
          setError(
            reason instanceof Error
              ? reason.message
              : 'The chapter could not be loaded.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [episode, attempt, setSkipping]);
  if (loaded)
    return (
      <Reader episode={loaded} skipping={skipping} setSkipping={setSkipping} />
    );
  return (
    <main className="reader-gate">
      <Link className="back-link" to={`/games/${episode.game}`}>
        <ArrowLeft size={16} />
        Back to stories
      </Link>
      <EmptyState title={error ? 'Chapter unavailable' : 'Loading chapter'}>
        {error || 'Loading the original text.'}
      </EmptyState>
      {error ? (
        <button onClick={() => setAttempt((value) => value + 1)}>
          Retry chapter
        </button>
      ) : (
        <p role="status">Loading…</p>
      )}
      {skipping ? (
        <IconButton
          label="Stop fast-forward"
          onClick={() => setSkipping(false)}
        >
          <SkipForward size={20} />
        </IconButton>
      ) : null}
    </main>
  );
}

function Reader({
  episode,
  skipping,
  setSkipping,
}: {
  episode: NonNullable<ReturnType<typeof episodeById>>;
} & FastForwardControl) {
  const store = useStore();
  const event = eventForEpisode(episode);
  const following = nextStory(event, episode);
  const p = store.data.preferences;
  const textOnly = episode.readingMode === 'text' || p.layout === 'text';
  const ui = useUi();
  const narrow = useNarrow();
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fixture = (params.get('fixture') ?? 'normal') as Fixture;
  const game = gameById(episode.game)!;
  const [initial] = useState(() => {
    try {
      const saved = store.data.saves[episode.id];
      if (!params.get('line'))
        return {
          save: saved ? resumeSave(episode, saved) : startSave(episode),
          error: '',
        };
      const restored = restorePassage(
        episode,
        params.get('line')!,
        params.get('choices'),
      );
      return {
        save: {
          ...restored,
          seen: [...new Set([...restored.seen, ...(saved?.seen ?? [])])],
          videoTime:
            saved?.frames.at(-1)?.node === restored.frames.at(-1)?.node
              ? saved.videoTime
              : 0,
        },
        error: '',
      };
    } catch (error) {
      return {
        save: startSave(episode),
        error:
          error instanceof Error
            ? error.message
            : 'This passage is unavailable.',
      };
    }
  });
  const [linkError, setLinkError] = useState(initial.error);
  const [save, setSave] = useState<ReadingSave>(initial.save);
  const [sceneRevision, setSceneRevision] = useState(0);
  const latest = useRef(save);
  latest.current = save;
  const [panel, setPanel] = useState<ReaderPanel | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [includeUnread, setIncludeUnread] = useState(false);
  const [auto, setAuto] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [videoDone, setVideoDone] = useState(false);
  const [reveal, setReveal] = useState({ key: '', count: 0 });
  const [voiceDone, setVoiceDone] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const voiceAnalysis = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    samples: Float32Array<ArrayBuffer>;
  } | null>(null);
  const [readySceneKey, setReadySceneKey] = useState<string | null>(null);
  const [loadedSceneEpisode, setLoadedSceneEpisode] = useState<string | null>(
    null,
  );
  const voiceLevel = useCallback(() => {
    const analysis = voiceAnalysis.current;
    if (!analysis || !audio.current || audio.current.paused) return 0;
    analysis.analyser.getFloatTimeDomainData(analysis.samples);
    return Math.sqrt(
      analysis.samples.reduce((sum, value) => sum + value * value, 0) /
        analysis.samples.length,
    );
  }, []);
  useEffect(() => {
    if (episode.renderer?.id !== 'pjsk' || !audio.current) return;
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio.current);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
    voiceAnalysis.current = {
      context,
      analyser,
      samples: new Float32Array(analyser.fftSize),
    };
    const resume = () => {
      void context.resume();
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      source.disconnect();
      analyser.disconnect();
      voiceAnalysis.current = null;
      void context.close();
    };
  }, [episode.id]);
  const music = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const enable = () => {
      if (audio.current?.src)
        void audio.current
          .play()
          .then(() => {
            setAudioBlocked(false);
            setVoiceDone(false);
          })
          .catch(() => setAudioBlocked(true));
    };
    window.addEventListener('onlystory-enable-audio', enable);
    return () => window.removeEventListener('onlystory-enable-audio', enable);
  }, []);
  const choice = useRef<HTMLButtonElement>(null);
  const sceneRegion = useRef<HTMLElement>(null);
  const dialogueRegion = useRef<HTMLDivElement>(null);
  const sceneGesture = useRef<{
    x: number;
    y: number;
    dragged: boolean;
    selected: boolean;
  } | null>(null);
  const node = nodeOf(episode, save);
  const sceneKey = `${node.id}:${sceneRevision}`;
  const setSceneReady = useCallback(
    (ready: boolean) => {
      setReadySceneKey(ready ? sceneKey : null);
      if (ready) setLoadedSceneEpisode(episode.id);
    },
    [sceneKey, episode.id],
  );
  const gfl1Frame =
    episode.renderer?.id === 'gfl1'
      ? (episode.renderer.payload as Gfl1Program).frames[node.id]
      : undefined;
  const [sceneStatus, setSceneStatus] = useState({ node: '', ready: false });
  const [finishSceneVersion, setFinishSceneVersion] = useState(0);
  const onSceneReady = useCallback(
    (node: string, ready: boolean) => setSceneStatus({ node, ready }),
    [],
  );
  const sceneReady =
    textOnly ||
    (episode.renderer?.id === 'pjsk'
      ? readySceneKey === sceneKey
      : episode.renderer?.id === 'ba-scene'
        ? node.kind === 'video' ||
          (sceneStatus.node === node.id && sceneStatus.ready)
        : true);
  const textReady = episode.renderer?.id !== 'ba-scene' || sceneReady;
  const answers = save.frames.at(-1)!.answers;
  const seekFrames = useMemo(
    () => readingPath(episode, answers),
    [episode, answers],
  );
  const canSkip =
    canFastForward(node) || (node.kind === 'end' && !!following?.id);
  const { text, speaker } = passageText(node, p);
  useEffect(() => {
    if (sceneRegion.current) sceneRegion.current.scrollTop = 0;
    if (dialogueRegion.current) dialogueRegion.current.scrollTop = 0;
  }, [node.id]);
  const chars = Array.from(text);
  const revealKey = `${node.id}:${p.textLocale}:${p.textVariant}:${p.playerName}`;
  const revealed = reveal.key === revealKey ? reveal.count : 0;
  const setRevealed = useCallback(
    (value: number | ((old: number) => number)) =>
      setReveal((old) => ({
        key: revealKey,
        count:
          typeof value === 'function'
            ? value(old.key === revealKey ? old.count : 0)
            : value,
      })),
    [revealKey],
  );
  const complete =
    textReady &&
    (skipping ||
      revealed >= chars.length ||
      p.textSpeed === 0 ||
      node.kind !== 'text');
  const unsupported = fixture === 'unsupported' || node.kind === 'unsupported';
  const installed = isInstalled(store.data, episode);
  const offline = fixture === 'offline' || !online;
  const expired = fixture === 'expired';
  const unavailable = offline && !installed && episode.readingMode !== 'text';
  const needsDownload =
    !installed && episode.availability === 'remote' && !offline;
  const activeVoice =
    (episode.renderer?.id !== 'ba-scene' || (sceneReady && !skipping)) &&
    p.voiceVolume > 0 &&
    node.voice
      ? fixture === 'missing-voice'
        ? '/demo/voice-unavailable.wav'
        : node.voice
      : undefined;
  const voiceUrl = useMediaUrl(activeVoice);
  const musicUrl = useMediaUrl(
    episode.renderer?.id === 'gfl1'
      ? node.bgm
      : episode.renderer
        ? undefined
        : '/demo/music.wav',
  );
  const bookmarkKey = `${episode.id}:${node.id}:${JSON.stringify(save.frames.at(-1)!.answers)}`;
  const bookmarked = store.data.bookmarks.some((b) => b.id === bookmarkKey);
  const from =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith('/')
      ? location.state.from
      : eventUrl(event) +
        (episode.preview ? '?previews=1' : episode.origin ? '' : '?examples=1');
  const returnState = { from: location.state?.catalogFrom };
  const blocked = !!linkError || expired || unavailable || needsDownload;
  const commit = useCallback(
    (next: ReadingSave, mode: 'advance' | 'seek' = 'seek') => {
      if (mode === 'seek') setSceneRevision((value) => value + 1);
      latest.current = next;
      setSave(next);
      store.save(next);
      navigate(
        passageUrl(episode, next, new URLSearchParams(location.search)),
        { replace: true, state: location.state },
      );
    },
    [store.save, navigate, episode, location.search, location.state],
  );
  const pausePlayback = useCallback(() => {
    setAuto(false);
    setSkipping(false);
  }, [setSkipping]);
  const seek = (frame: Frame) => {
    pausePlayback();
    const restored = restorePassage(
      episode,
      frame.node,
      JSON.stringify(frame.answers),
    );
    commit({ ...restored, seen: latest.current.seen });
  };
  useEffect(() => {
    const line = params.get('line');
    const answers = params.get('choices') ?? '{}';
    const currentAnswers =
      new URL(
        passageUrl(episode, latest.current),
        window.location.origin,
      ).searchParams.get('choices') ?? '{}';
    if (
      line &&
      (line !== latest.current.frames.at(-1)?.node ||
        answers !== currentAnswers)
    ) {
      try {
        const restored = restorePassage(episode, line, params.get('choices'));
        const merged = { ...restored, seen: latest.current.seen };
        latest.current = merged;
        setSave(merged);
        setSceneRevision((value) => value + 1);
        store.save(merged);
        setLinkError('');
      } catch (error) {
        setLinkError(
          error instanceof Error ? error.message : 'Invalid passage link.',
        );
      }
    }
  }, [params, episode, store.save]);
  useEffect(() => {
    if (!blocked) {
      if (!params.get('line')) commit(save);
      else store.save(save);
    }
  }, []);
  useEffect(() => {
    setRevealed(0);
    setVideoDone(false);
    if (node.kind === 'choice' && !blocked)
      requestAnimationFrame(() => choice.current?.focus());
  }, [node.id, blocked, setRevealed]);
  useEffect(() => {
    if (skipping) {
      setRevealed(chars.length);
      return;
    }
    if (!textReady || complete || p.textSpeed === 0 || panel || ui.active)
      return;
    let cursor = revealed;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const pause = (node.scene.textPauses ?? []).reduce(
        (total, point) => total + (point.offset === cursor ? point.delay : 0),
        0,
      );
      timer = setTimeout(
        () => {
          cursor = Math.min(chars.length, cursor + 1);
          setRevealed(cursor);
          if (cursor < chars.length) schedule();
        },
        1000 / p.textSpeed + pause,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [
    node.id,
    skipping,
    textReady,
    complete,
    p.textSpeed,
    chars.length,
    panel,
    ui.active,
    setRevealed,
  ]);
  useEffect(() => {
    if (!blocked && complete && !save.seen.includes(node.id)) {
      const next = markSeen(save);
      latest.current = next;
      setSave(next);
      store.save(next);
    }
  }, [complete, blocked, node.id, save, store.save]);
  useEffect(() => {
    const player = audio.current;
    setVoiceError(false);
    setVoiceDone(!activeVoice);
    if (
      !player ||
      !voiceUrl ||
      blocked ||
      panel ||
      ui.active ||
      (!textOnly && !sceneReady)
    )
      return;
    setVoiceDone(false);
    player.volume = p.voiceVolume;
    void player.play().catch((error) => {
      if (error.name === 'NotAllowedError') {
        setAudioBlocked(true);
        setVoiceDone(true);
      }
    });
    return () => player.pause();
  }, [voiceUrl, node.id, blocked, sceneReady, textOnly]);
  useEffect(() => {
    if (audio.current) audio.current.volume = p.voiceVolume;
    if (music.current) music.current.volume = p.musicVolume;
  }, [p.voiceVolume, p.musicVolume]);
  useEffect(() => {
    if (!music.current || !musicUrl || blocked || p.musicVolume === 0) {
      music.current?.pause();
      return;
    }
    void music.current.play().catch((error) => {
      if (error.name === 'NotAllowedError') setAudioBlocked(true);
    });
    return () => music.current?.pause();
  }, [musicUrl, blocked, p.musicVolume]);
  useEffect(() => {
    if (panel || ui.active) {
      setAuto(false);
      setSkipping(false);
      audio.current?.pause();
    } else if (activeVoice && voiceUrl && !voiceDone && !voiceError)
      void audio.current?.play().catch(() => setVoiceDone(true));
  }, [panel, ui.active]);
  const open = useCallback(
    (name: ReaderPanel) => {
      setAuto(false);
      setSkipping(false);
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setQuery('');
      setPanel(name);
    },
    [setSkipping],
  );
  const next = useCallback(
    (answer?: string, skipMovie = false, repeated = false) => {
      const rapid =
        repeated && episode.renderer?.id === 'pjsk' && node.kind === 'text';
      if (blocked || unsupported) return;
      if (episode.renderer?.id === 'ba-scene' && !sceneReady) {
        setFinishSceneVersion((value) => value + 1);
        return;
      }
      // Once assets are loaded, manual input can interrupt native scene waits.
      // Restore the destination snapshot to cancel delayed commands safely.
      const interrupt =
        episode.renderer?.id === 'pjsk' &&
        node.kind === 'text' &&
        loadedSceneEpisode === episode.id &&
        !sceneReady;
      if (!textOnly && !sceneReady && !rapid && !interrupt) return;
      if (hidden) {
        setHidden(false);
        // A completed interaction must still submit its answer when controls
        // were hidden during its animation. Plain advance only reveals UI.
        if (answer === undefined) return;
      }
      if (!complete && !rapid) {
        setRevealed(chars.length);
        return;
      }
      if (node.kind === 'end') {
        if (following)
          navigate(
            passageUrl(
              following,
              store.data.saves[following.id] ?? startSave(following),
            ),
            { state: location.state },
          );
        return;
      }
      if (node.kind === 'video' && !videoDone && !skipMovie) return;
      const result = advance(episode, latest.current, answer);
      if (result !== latest.current)
        commit(result, rapid || interrupt ? 'seek' : 'advance');
    },
    [
      blocked,
      sceneReady,
      loadedSceneEpisode,
      textOnly,
      unsupported,
      node,
      hidden,
      complete,
      chars.length,
      videoDone,
      episode,
      following,
      commit,
      navigate,
      store.data.saves,
      location.state,
    ],
  );
  useEffect(() => {
    if (
      !node.scene.autoAdvance ||
      !sceneReady ||
      blocked ||
      panel ||
      ui.active ||
      hidden ||
      skipping
    )
      return;
    const timer = setTimeout(() => next(), 0);
    return () => clearTimeout(timer);
  }, [
    node.id,
    node.scene.autoAdvance,
    sceneReady,
    blocked,
    panel,
    ui.active,
    hidden,
    skipping,
    next,
  ]);
  useEffect(() => {
    if (
      !auto ||
      (!textOnly && !sceneReady) ||
      panel ||
      ui.active ||
      hidden ||
      blocked ||
      unsupported ||
      !complete ||
      node.kind !== 'text' ||
      (p.waitVoice && activeVoice && !voiceDone && !voiceError)
    )
      return;
    const timer = setTimeout(() => next(), p.autoDelay * 1000);
    return () => clearTimeout(timer);
  }, [
    auto,
    sceneReady,
    textOnly,
    panel,
    ui.active,
    hidden,
    blocked,
    unsupported,
    complete,
    node.id,
    node.kind,
    p.autoDelay,
    p.waitVoice,
    activeVoice,
    voiceDone,
    voiceError,
    next,
  ]);
  useEffect(() => {
    if (node.kind !== 'text' || unsupported) {
      setAuto(false);
    }
  }, [node.kind, unsupported]);
  useEffect(() => {
    if (!skipping || blocked || unsupported || panel || ui.active || !canSkip) {
      if (skipping) setSkipping(false);
      return;
    }
    const timer = setTimeout(() => {
      if (node.kind === 'end') {
        next();
        return;
      }
      setRevealed(chars.length);
      const result = advance(episode, latest.current);
      if (result !== latest.current) commit(result, 'advance');
      else setSkipping(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [
    skipping,
    node,
    save,
    canSkip,
    setSkipping,
    blocked,
    unsupported,
    panel,
    ui.active,
    episode,
    chars.length,
    commit,
    next,
  ]);
  const previous = useCallback(() => {
    setAuto(false);
    setSkipping(false);
    if (save.frames.length > 1) commit(rewind(save, save.frames.length - 2));
  }, [save, commit, setSkipping]);
  const retryScene = () => {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('fixture');
    navigate(`${location.pathname}?${nextParams}`, {
      replace: true,
      state: location.state,
    });
  };
  const execute = useCallback(
    (command: ReaderCommand) => {
      if (hidden && command !== 'hide') {
        setHidden(false);
        return;
      }
      if (command === 'next') next();
      else if (command === 'next-repeat') next(undefined, false, true);
      else if (command === 'previous') previous();
      else if (command === 'auto') {
        if (node.kind === 'text' && !blocked && !unsupported) {
          setSkipping(false);
          setAuto((value) => !value);
        }
      } else if (command === 'skip') {
        setAuto(false);
        if (canSkip && !unsupported && !blocked) setSkipping((value) => !value);
        else
          store.notify(
            'Fast-forward stops at choices, movies and unavailable scenes.',
          );
      } else if (
        command === 'history' ||
        command === 'transcript' ||
        command === 'saves' ||
        command === 'information'
      )
        open(command);
      else if (command === 'bookmark') store.bookmark(episode, save, text);
      else if (command === 'chapters') {
        if (narrow) open('chapters');
        else store.preferences({ chaptersOpen: !p.chaptersOpen });
      } else if (command === 'hide') {
        setAuto(false);
        setSkipping(false);
        setHidden((value) => !value);
      } else if (command === 'fullscreen') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else
          void document.documentElement
            .requestFullscreen()
            .catch(() =>
              store.notify('Fullscreen is unavailable in this browser.'),
            );
      }
    },
    [
      hidden,
      next,
      previous,
      node,
      blocked,
      unsupported,
      save,
      canSkip,
      setSkipping,
      p.chaptersOpen,
      open,
      store.bookmark,
      store.preferences,
      store.notify,
      episode,
      text,
      narrow,
    ],
  );
  useEffect(() => {
    const listener = (event: Event) =>
      execute((event as CustomEvent<ReaderCommand>).detail);
    window.addEventListener('onlystory:reader-command', listener);
    return () =>
      window.removeEventListener('onlystory:reader-command', listener);
  }, [execute]);
  const chapterList = (
    <div className="chapter-list">
      <label className="search-field">
        <Search size={16} />
        <input
          type="search"
          aria-label="Search chapters"
          value={query}
          placeholder="Find a chapter…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <nav aria-label="Chapters">
        {storySections(event, query).map((section) => {
          const links = [...section.main, ...section.independent].map(
            ({ episode: e, branch }) => (
              <Link
                className={`${e.id === episode.id ? 'current' : ''} ${branch ? 'chapter-side' : ''}`}
                key={e.id}
                to={passageUrl(e, store.data.saves[e.id] ?? startSave(e))}
                state={{ from, catalogFrom: location.state?.catalogFrom }}
                onClick={() => setPanel(null)}
              >
                <small>{String(e.order).padStart(2, '0')}</small>
                <span>
                  <strong>{e.title}</strong>
                  {branch ? (
                    <small>
                      Side story{branch.title ? ` · ${branch.title}` : ''}
                    </small>
                  ) : null}
                </span>
                {store.data.saves[e.id]?.completed ? <Check size={14} /> : null}
              </Link>
            ),
          );
          return section.chapter ? (
            <details
              className="reader-chapter-section"
              key={`${section.id}:${!!query}`}
              open={!!query || section.id === episode.chapter?.id}
            >
              <summary>{section.chapter.title}</summary>
              <nav aria-label={section.chapter.title}>{links}</nav>
            </details>
          ) : (
            <nav key={section.id} aria-label="Event stories">
              {links}
            </nav>
          );
        })}
      </nav>
    </div>
  );
  const enabledNext =
    !blocked &&
    !unsupported &&
    node.kind !== 'choice' &&
    (node.kind !== 'end' || !!following?.id) &&
    (node.kind !== 'video' || videoDone);
  const activeHistory = save.frames
    .map((frame, index) => ({
      frame,
      index,
      node: episode.nodes.find((n) => n.id === frame.node)!,
    }))
    .filter(
      (item) =>
        `${passageText(item.node, p).speaker} ${passageText(item.node, p).text}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!onlyBookmarks ||
          store.data.bookmarks.some(
            (b) =>
              b.episodeId === episode.id &&
              b.snapshot.frames.at(-1)?.node === item.node.id,
          )),
    );
  const checkpoints = store.data.checkpoints.filter(
    (point) => point.episodeId === episode.id,
  );
  if (blocked)
    return (
      <main className="reader-gate">
        <Link className="back-link" to={from}>
          <ArrowLeft size={16} />
          Back to stories
        </Link>
        <EmptyState
          title={
            linkError
              ? 'Passage unavailable'
              : expired
                ? 'Server session expired'
                : unavailable
                  ? 'This episode is not on this device'
                  : 'Download this episode'
          }
        >
          {linkError ||
            (expired
              ? 'Your local progress is safe. Reconnect to your private server or return to your device library.'
              : unavailable
                ? 'The server is disconnected. Read an installed episode or reconnect to download this one.'
                : 'The sample media will be cached on this device. Downloads do not require a game installation.')}
        </EmptyState>
        <div className="gate-actions">
          {linkError ? (
            <button
              onClick={() => {
                setLinkError('');
                commit(startSave(episode));
              }}
            >
              Open episode from the start
            </button>
          ) : expired || unavailable ? (
            <>
              <button
                onClick={() => {
                  store.preferences({ source: 'device' });
                  navigate('/library');
                }}
              >
                Return to device library
              </button>
              <button onClick={retryScene}>Reconnect preview</button>
            </>
          ) : (
            <>
              <button
                className="primary-button"
                onClick={() => store.download(episode)}
                disabled={store.transfers[episode.id]?.status === 'downloading'}
              >
                <Download size={17} />
                {store.transfers[episode.id]?.status === 'downloading'
                  ? 'Downloading…'
                  : 'Download episode'}
              </button>
              <Link to="/manage">View downloads</Link>
              {store.transfers[episode.id]?.status === 'failed' ? (
                <p role="alert">{store.transfers[episode.id].error}</p>
              ) : null}
            </>
          )}
        </div>
        {fixture !== 'normal' ? (
          <p className="page-note">
            Design fixture · no private server is connected.
          </p>
        ) : null}
      </main>
    );
  return (
    <main
      className={`reader-page layout-${textOnly ? 'text' : p.layout} ${hidden ? 'hide-ui' : ''}`}
      style={
        {
          '--game-accent': game.accent,
          '--reader-font-size': `${p.fontSize}px`,
          '--chapter-width': `${p.panelWidth}px`,
        } as CSSProperties
      }
    >
      <header className="reader-header">
        <Link
          className="icon-link"
          to={from}
          state={returnState}
          aria-label="Back to stories"
        >
          <ArrowLeft size={19} />
        </Link>
        <div>
          <strong>{episode.title}</strong>
          <small>
            {textOnly ? (
              <span className="mobile-reading-mode">文字模式 · </span>
            ) : null}
            {game.name} <span> / </span> {episode.story}
          </small>
        </div>
        <span className="sample-label">
          {episode.game === 'gfl1' && episode.origin === 'game'
            ? textOnly
              ? 'English · Text mode'
              : 'English · Original scenes'
            : textOnly
              ? `${episode.textLocales?.includes('ja') ? '日本語' : '简中'} · 文字模式`
              : episode.origin === 'game'
                ? episode.game === 'ba'
                  ? '日本語 · 原始演出'
                  : episode.preview
                    ? '简中 · 原文开场'
                    : '简中 · 原始演出'
                : 'Design fixture'}
        </span>
        {episode.origin === 'game' ? (
          <IconButton
            label="Story information"
            onClick={() => open('information')}
          >
            <Info size={17} />
          </IconButton>
        ) : null}
        <IconButton label="Fullscreen" onClick={() => execute('fullscreen')}>
          <Maximize size={17} />
        </IconButton>
      </header>
      <div className="reading-workspace">
        {p.chaptersOpen && !narrow ? (
          <aside className="chapter-sidebar">
            <h2>Chapters</h2>
            {chapterList}
          </aside>
        ) : null}
        <section
          className="scene-reader"
          ref={sceneRegion}
          aria-label="Story reader"
          onPointerDown={(event) => {
            sceneGesture.current =
              event.isPrimary && event.button === 0
                ? {
                    x: event.clientX,
                    y: event.clientY,
                    dragged: false,
                    selected: !!window.getSelection()?.toString().trim(),
                  }
                : null;
          }}
          onPointerMove={(event) => {
            const gesture = sceneGesture.current;
            if (
              gesture &&
              Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >
                6
            )
              gesture.dragged = true;
          }}
          onPointerCancel={() => {
            sceneGesture.current = null;
          }}
          onClick={(event) => {
            const gesture = sceneGesture.current;
            sceneGesture.current = null;
            if (
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey ||
              !gesture ||
              gesture.dragged
            )
              return;
            // Artwork is nonselectable, so explicitly clear a prior dialogue
            // selection on a background click. This click only deselects.
            // Whitespace-only image selections must never trap advancement.
            const selection = window.getSelection();
            if (gesture.selected || selection?.toString().trim()) {
              if ((event.target as HTMLElement).closest('.gfl1-stage'))
                selection?.removeAllRanges();
              return;
            }
            if (
              (event.target as HTMLElement).closest(
                'button,a,input,select,textarea,video,audio,summary,[role="button"],[contenteditable="true"]',
              )
            )
              return;
            if (node.kind !== 'video') next();
          }}
        >
          <SceneHost
            episode={episode}
            onReadyChange={setSceneReady}
            voiceLevel={voiceLevel}
            fastForward={skipping}
            seekVersion={sceneRevision}
            path={save.frames.map((frame) => frame.node)}
            textOnly={textOnly}
            finishVersion={finishSceneVersion}
            onSceneReady={onSceneReady}
            textComplete={complete}
            key={
              episode.renderer
                ? episode.id
                : `${node.scene.background}-${node.kind}-${fixture}`
            }
            node={node}
            fixture={fixture}
            game={episode.game}
            videoTime={save.videoTime}
            retry={retryScene}
            onVideoEnd={() => setVideoDone(true)}
            onVideoTime={(time) => {
              if (latest.current.frames.at(-1)?.node === node.id) {
                const updated = { ...latest.current, videoTime: time };
                latest.current = updated;
                setSave(updated);
                store.save(updated);
              }
            }}
            skipVideo={() => next(undefined, true)}
          />
          {gfl1Frame?.interaction && node.kind === 'choice' ? (
            <Gfl1Interaction
              key={`${node.id}:${sceneRevision}`}
              interaction={gfl1Frame.interaction}
              choices={node.choices}
              onAnswer={next}
              volume={p.soundVolume}
              disabled={blocked || !!panel || !!ui.active}
              textOnly={textOnly}
              locale={p.textLocale}
              reducedMotion={
                p.reducedMotion ||
                window.matchMedia('(prefers-reduced-motion: reduce)').matches
              }
            />
          ) : null}
          {node.kind === 'choice' &&
          textReady &&
          (!gfl1Frame?.interaction ||
            gfl1Frame.interaction.kind === 'quiz' ||
            (gfl1Frame.interaction.kind === 'exploration' &&
              (textOnly || !gfl1Frame.interaction.spots.length))) ? (
            <div className="story-choices" aria-label="Choose a response">
              {node.choices?.map((answer, i) => (
                <button
                  ref={i === 0 ? choice : undefined}
                  key={answer.id}
                  onClick={() => next(answer.id)}
                >
                  {(p.textVariant === 'female'
                    ? answer.femaleLabel?.[p.textLocale]
                    : undefined) ?? localizedText(answer.label, p.textLocale)}
                </button>
              ))}
            </div>
          ) : null}
          {unsupported ? (
            <div className="unsupported-notice" role="status">
              <AlertTriangle size={17} />
              <span>
                This archive contains an unsupported or missing scene. It will
                not be skipped.
              </span>
              <button onClick={() => open('transcript')}>
                Read available text
              </button>
            </div>
          ) : null}
          <div
            className={`dialogue-window window-${node.scene.window ?? 'dialogue'}`}
            ref={dialogueRegion}
            style={
              node.scene.fontScale
                ? ({
                    '--reader-font-size': `${p.fontSize * node.scene.fontScale}px`,
                  } as CSSProperties)
                : undefined
            }
            hidden={
              node.kind === 'video' ||
              (!!gfl1Frame?.hideDialogue && !textOnly) ||
              (episode.renderer?.id === 'gfl1' &&
                node.kind === 'text' &&
                !text.trim() &&
                !speaker.trim() &&
                !textOnly) ||
              node.scene.autoAdvance ||
              !textReady ||
              node.kind === 'choice' ||
              (!textOnly &&
                episode.renderer?.id === 'ba-scene' &&
                node.scene.window === 'system')
            }
          >
            <div className="speaker-row" hidden={gfl1Frame?.narrator}>
              <span>{speaker}</span>
              {bookmarked ? (
                <Bookmark
                  size={14}
                  fill="currentColor"
                  aria-label="Bookmarked"
                />
              ) : null}
            </div>
            <p
              key={`${node.id}-${p.textLocale}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {chars.map((char, index) => (
                <span
                  key={index}
                  style={{ opacity: complete || index < revealed ? 1 : 0 }}
                >
                  {char}
                </span>
              ))}
            </p>
            {node.kind === 'end' ? (
              <div className="episode-end">
                <span>
                  <Check size={14} />
                  {episode.completionLabel ?? 'Episode finished'}
                </span>
                <Link to={from} state={returnState}>
                  Back to stories
                  <ChevronRight size={14} />
                </Link>
                {following?.id ? (
                  <Link
                    className="text-link"
                    to={passageUrl(
                      following!,
                      store.data.saves[following?.id] ?? startSave(following!),
                    )}
                    state={location.state}
                  >
                    Next section · {following?.title}
                    <ChevronRight size={14} />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <StoryProgress
        frames={seekFrames}
        current={node.id}
        onPause={pausePlayback}
        onSeek={seek}
      />
      <nav className="reader-toolbar" aria-label="Reading controls">
        <div className="toolbar-group">
          <IconButton
            label={p.chaptersOpen && !narrow ? 'Collapse chapters' : 'Chapters'}
            shortcut="C"
            aria-pressed={p.chaptersOpen && !narrow}
            onClick={() => execute('chapters')}
          >
            <PanelLeft size={18} />
          </IconButton>
          <IconButton
            label="History"
            shortcut="H"
            onClick={() => open('history')}
          >
            <History size={18} />
          </IconButton>
          <IconButton
            label={bookmarked ? 'Remove bookmark' : 'Bookmark passage'}
            shortcut="B"
            aria-pressed={bookmarked}
            onClick={() => execute('bookmark')}
          >
            <Bookmark size={18} />
          </IconButton>
          <IconButton
            label="Save points"
            className="checkpoint-button"
            onClick={() => open('saves')}
          >
            <Save size={18} />
          </IconButton>
        </div>
        <div className="toolbar-group playback-controls">
          <IconButton
            label="Previous passage"
            shortcut="←"
            disabled={save.frames.length < 2}
            onClick={previous}
          >
            <ChevronLeft size={21} />
          </IconButton>
          <IconButton
            label={auto ? 'Pause auto reading' : 'Auto reading'}
            shortcut="A"
            aria-pressed={auto}
            disabled={node.kind !== 'text' || unsupported}
            onClick={() => execute('auto')}
          >
            {auto ? <Pause size={20} /> : <Play size={20} />}
          </IconButton>
          <IconButton
            label={skipping ? 'Stop fast-forward' : 'Fast-forward'}
            shortcut="F"
            aria-pressed={skipping}
            disabled={!canSkip || unsupported}
            onClick={() => execute('skip')}
          >
            <SkipForward size={20} />
          </IconButton>
          <IconButton
            label={
              !sceneReady
                ? 'Finish scene'
                : !complete
                  ? 'Reveal text'
                  : node.kind === 'end' && following?.id
                    ? 'Next section'
                    : 'Next passage'
            }
            shortcut="Space / →"
            className="advance-button"
            disabled={!enabledNext}
            onClick={() => next()}
          >
            <ChevronRight size={22} />
          </IconButton>
          <span
            className="passage-position"
            aria-label={`Passage ${save.frames.length}`}
          >
            {String(save.frames.length).padStart(2, '0')}
          </span>
        </div>
        <div className="toolbar-group utility-controls">
          <IconButton
            label="Commands & shortcuts"
            shortcut="Ctrl+K"
            onClick={() => ui.open('commands')}
          >
            <Command size={18} />
          </IconButton>
          <IconButton
            label="Reader settings"
            shortcut=","
            onClick={() => ui.open('settings')}
          >
            <Settings2 size={18} />
          </IconButton>
          <IconButton
            label="Hide controls"
            shortcut="U"
            onClick={() => execute('hide')}
          >
            <EyeOff size={18} />
          </IconButton>
        </div>
      </nav>
      {audioBlocked || voiceError ? (
        <div className="audio-status" role="status">
          {voiceError
            ? 'Voice unavailable. Reading can continue.'
            : 'Your browser paused audio.'}
          {audioBlocked ? (
            <IconButton
              label="Enable audio"
              onClick={() => {
                setAudioBlocked(false);
                setVoiceDone(!activeVoice);
                window.dispatchEvent(new Event('onlystory:enable-audio'));
                void music.current?.play();
                void audio.current?.play();
              }}
            >
              <Volume2 size={17} />
            </IconButton>
          ) : null}
        </div>
      ) : null}
      {hidden ? (
        <IconButton
          label="Show controls"
          className="show-controls"
          onClick={() => setHidden(false)}
        >
          <Eye size={19} />
        </IconButton>
      ) : null}
      <audio
        ref={audio}
        src={voiceUrl}
        onEnded={() => setVoiceDone(true)}
        onError={() => {
          setVoiceError(true);
          setVoiceDone(true);
        }}
      />
      <audio ref={music} src={musicUrl} loop />
      {episode.renderer?.id === 'gfl1' ? (
        <Gfl1Effects
          payload={episode.renderer.payload}
          nodeId={node.id}
          seekVersion={sceneRevision}
          enabled={
            !blocked && !skipping && ['text', 'choice'].includes(node.kind)
          }
          volume={p.soundVolume}
          onBlocked={setAudioBlocked}
        />
      ) : null}
      <Panel
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={
          panel === 'history'
            ? 'History'
            : panel === 'chapters'
              ? 'Chapters'
              : panel === 'saves'
                ? 'Save points'
                : panel === 'information'
                  ? 'Story information'
                  : 'Available transcript'
        }
        description={
          panel === 'history'
            ? 'Jumping back restores that passage and its branch context.'
            : undefined
        }
        returnFocus={trigger.current}
      >
        {panel === 'chapters' ? (
          chapterList
        ) : panel === 'history' ? (
          <>
            <label className="search-field">
              <Search size={17} />
              <input
                autoFocus
                type="search"
                aria-label="Search episode history"
                placeholder="Find a passage…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={onlyBookmarks}
                onChange={(e) => setOnlyBookmarks(e.target.checked)}
              />
              Bookmarks only
            </label>
            <div className="history-list">
              {activeHistory.map(({ index, node: line }) => (
                <button
                  key={`${line.id}-${index}`}
                  onClick={() => {
                    commit(rewind(save, index));
                    setPanel(null);
                  }}
                >
                  <small>
                    {passageText(line, p).speaker}
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </small>
                  <p>{passageText(line, p).text}</p>
                </button>
              ))}
              {!activeHistory.length ? (
                <p className="field-note">No matching passages.</p>
              ) : null}
            </div>
          </>
        ) : panel === 'saves' ? (
          <>
            <p className="field-note">
              Progress saves automatically. Named checkpoints keep a separate
              restorable reading state.
            </p>
            <button
              onClick={() => {
                const checkpoint: SavedPoint = {
                  id: crypto.randomUUID(),
                  episodeId: episode.id,
                  label: `${speaker} · ${text.slice(0, 60)}`,
                  snapshot: structuredClone(save),
                  createdAt: new Date().toISOString(),
                };
                store.setData((old) => ({
                  ...old,
                  checkpoints: [...old.checkpoints, checkpoint],
                }));
                store.notify('Checkpoint saved.');
              }}
            >
              <Save size={16} />
              Save current point
            </button>
            <div className="checkpoint-list">
              {checkpoints.map((point) => (
                <article key={point.id}>
                  <div>
                    <strong>{point.label}</strong>
                    <small>{new Date(point.createdAt).toLocaleString()}</small>
                  </div>
                  <IconButton
                    label="Restore checkpoint"
                    onClick={() => {
                      try {
                        commit(
                          resumeSave(episode, structuredClone(point.snapshot)),
                        );
                        setPanel(null);
                      } catch (error) {
                        store.notify(
                          error instanceof Error
                            ? error.message
                            : 'This checkpoint is unavailable.',
                        );
                      }
                    }}
                  >
                    <RotateCcw size={17} />
                  </IconButton>
                  <IconButton
                    label="Remove checkpoint"
                    onClick={() => {
                      store.setData((old) => ({
                        ...old,
                        checkpoints: old.checkpoints.filter(
                          (s) => s.id !== point.id,
                        ),
                      }));
                      store.notify('Checkpoint removed.', {
                        label: 'Undo',
                        run: () =>
                          store.setData((old) => ({
                            ...old,
                            checkpoints: [...old.checkpoints, point],
                          })),
                      });
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </article>
              ))}
            </div>
            {!checkpoints.length ? (
              <p className="field-note">
                No named checkpoints for this episode yet.
              </p>
            ) : null}
          </>
        ) : panel === 'information' ? (
          <div className="story-information">
            <h3>
              {['gfl2-event', 'pjsk', 'gfl1', 'ba-scene'].includes(
                episode.renderer?.id ?? '',
              ) && !textOnly
                ? 'Original scene playback'
                : 'Original text reading'}
            </h3>
            <p>
              {episode.renderer?.id === 'pjsk' && !textOnly ? (
                'This episode plays original Chinese text with Japanese voices, Live2D characters, motions, facial animation, backgrounds, music and sound effects. Browser transitions and timing approximate the original game.'
              ) : episode.renderer?.id === 'gfl1' && !textOnly ? (
                'This chapter uses original Steam global English text, backgrounds, portrait expressions, communication frames, music and sound effects. Portrait placement, transmission scanning and scene transitions approximate the game. A gameplay map is not imported; transmissions retain the previous illustrated background where available. Dialogue voices are not imported. Open the source script to inspect the original commands.'
              ) : episode.renderer?.id === 'ba-scene' && !textOnly ? (
                'This chapter plays original JP backgrounds, Spine character animations and expressions, Japanese dialogue voices, music and sound effects. Scene commands and waits follow the archived source script. Assets are stored locally and included in episode downloads.'
              ) : episode.renderer?.id === 'gfl2-event' && !textOnly ? (
                'This chapter plays recovered backgrounds, Live2D models, expressions, holograms and music in original script order. Movies support Chinese and Japanese audio. Regular dialogue has no voice track. Some Unity effects and browser rendering remain approximate.'
              ) : (
                <>
                  This chapter follows the recovered script rows with original
                  text and speaker names. Character visuals, backgrounds,
                  effects, voice and music are not played in this mode.
                </>
              )}
            </p>
            <p>
              All source commands are retained. Unknown control flow blocks
              import instead of being treated as ordinary dialogue.
            </p>
            <dl>
              <dt>Section</dt>
              <dd>
                {episode.order} · {episode.title}
              </dd>
              <dt>Current source</dt>
              <dd>
                {node.source?.script} · row {node.source?.row}
              </dd>
              <dt>Original passages</dt>
              <dd>{episode.nodes.length}</dd>
            </dl>
            {episode.sourceUrl ? (
              <a className="text-link" href={episode.sourceUrl} download>
                Download original script data
              </a>
            ) : null}
          </div>
        ) : panel === 'transcript' ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={includeUnread}
                onChange={(e) => setIncludeUnread(e.target.checked)}
              />
              Include unread passages and alternate branches
            </label>
            <div className="transcript">
              {episode.nodes
                .filter((n) => includeUnread || save.seen.includes(n.id))
                .map((n) => (
                  <section key={n.id}>
                    <h3>{passageText(n, p).speaker}</h3>
                    <p>{passageText(n, p).text}</p>
                    {n.kind === 'unsupported' ? (
                      <p className="error-text">
                        Scene missing from the archive.
                      </p>
                    ) : null}
                  </section>
                ))}
            </div>
          </>
        ) : null}
      </Panel>
    </main>
  );
}
