import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasOnlineSource, isBaImport } from '../downloads/providers';
import { Gfl1Effects } from '../playback/gfl1/Gfl1Effects';
import { Gfl1Interaction } from '../playback/gfl1/Gfl1Interaction';
import type { Gfl1Program } from '../playback/gfl1/story';
import type { BaProgram } from '../playback/ba/types';
import { isBaScreenTextStep } from '../playback/ba/screen-text';
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
  LoaderCircle,
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
  playerNameText,
  localizedText,
  gamePreferences,
  readingTimeline,
} from '../model';
import type {
  Bookmark as SavedPoint,
  Fixture,
  Frame,
  ReadingSave,
} from '../model';
import { useLocalLibrary, useMediaUrl, useNarrow, useOnline } from '../hooks';
import { isInstalled, useStore } from '../store';
import { usePlaybackPreferences } from '../store';
import { useUi } from '../ui';
import type { ReaderCommand } from '../ui';
import { EmptyState, IconButton, Panel } from '../components/Primitives';
import { SceneHost } from '../components/SceneHost';
import { StoryProgress } from '../components/StoryProgress';
import { episodeTitle, localizedTitle } from '../localized-titles';
import { battleNotice } from '../battle-notices';
import { useI18n } from '../i18n';
import { sceneMarkers } from '../scene-markers';

type ReaderPanel = 'history' | 'chapters' | 'saves' | 'information';
type FastForwardControl = {
  skipping: boolean;
  setSkipping: Dispatch<SetStateAction<boolean>>;
};
export function ReaderRoute() {
  const { t } = useI18n();
  const [skipping, setSkipping] = useState(false);
  const { game, episode: id } = useParams();
  const episode = episodeById(id);
  if (!episode || episode.game !== game)
    return (
      <main className="page">
        <EmptyState
          title={t('Episode not found')}
          action={<Link to="/library">{t('Return to library')}</Link>}
        >
          {t('This link does not match an episode in your library.')}
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
  const { t } = useI18n();
  const { data, transfers, download, cancel } = useStore();
  const title = episodeTitle(
    episode,
    gamePreferences(data.preferences, episode.game).catalogLocale,
  );
  const localLibrary = useLocalLibrary();
  const acquired =
    episode.origin !== 'game' ||
    localLibrary === true ||
    data.installed[episode.id] === true;
  const transfer = transfers[episode.id];
  const [loaded, setLoaded] = useState(episode.content ? null : episode);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!episode.content || !acquired) return;
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
  }, [episode, attempt, setSkipping, acquired]);
  if (!acquired && localLibrary !== null)
    return (
      <main className="reader-gate">
        <Link className="back-link" to={`/games/${episode.game}`}>
          <ArrowLeft size={16} />
          {t('Back to stories')}
        </Link>
        <EmptyState
          title={hasOnlineSource(episode) ? title : t('Downloader pending')}
        >
          {!hasOnlineSource(episode)
            ? t(
                'This story does not have a verified downloader yet. Its catalog and saved progress remain on this device.',
              )
            : isBaImport(episode)
              ? t(
                  'Download or import this story’s original files for offline reading.',
                )
              : t('Download this story for offline reading.')}
        </EmptyState>
        {isBaImport(episode) ? (
          <Link
            className="button primary-button"
            to={`/downloads/${episode.id}`}
          >
            {t('Download or import story')}
          </Link>
        ) : null}
        {!hasOnlineSource(episode) ||
        isBaImport(episode) ? null : transfer?.status === 'downloading' ? (
          <>
            <p role="status">
              {t('Downloading ·')} {transfer.filesDone ?? 0} /{' '}
              {transfer.filesTotal ?? '…'} {t('files')}
            </p>
            <progress
              aria-label={t('Downloading {story}', { story: title })}
              max={transfer.total || 1}
              value={transfer.bytes}
            />
            <button onClick={() => cancel(episode.id)}>
              {t('Cancel download')}
            </button>
          </>
        ) : (
          <>
            {transfer?.status === 'failed' ? (
              <p role="alert">{transfer.error}</p>
            ) : null}
            {transfer?.status === 'canceled' ? (
              <p role="status">
                {t('Download canceled. Retry to reuse saved files.')}
              </p>
            ) : null}
            <button onClick={() => download(episode)}>
              {transfer?.status === 'failed'
                ? t('Retry download')
                : t('Download story')}
            </button>
          </>
        )}
      </main>
    );
  if (loaded && acquired)
    return (
      <Reader episode={loaded} skipping={skipping} setSkipping={setSkipping} />
    );
  return (
    <main className="reader-gate">
      <Link className="back-link" to={`/games/${episode.game}`}>
        <ArrowLeft size={16} />
        {t('Back to stories')}
      </Link>
      <EmptyState
        title={error ? t('Chapter unavailable') : t('Loading chapter')}
      >
        {error ? t(error) : t('Loading the original text.')}
      </EmptyState>
      {error ? (
        <button onClick={() => setAttempt((value) => value + 1)}>
          {t('Retry chapter')}
        </button>
      ) : (
        <p role="status">{t('Loading…')}</p>
      )}
      {skipping ? (
        <IconButton
          label={t('Stop fast-forward')}
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
  const { t, locale: uiLocale } = useI18n();
  const store = useStore();
  const event = eventForEpisode(episode);
  const following = nextStory(event, episode);
  const p = usePlaybackPreferences();
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
  const [maximized, setMaximized] = useState(false);
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
  const skippedBattle = battleNotice(episode, node);
  useEffect(() => {
    if (!skippedBattle) return;
    setAuto(false);
    setSkipping(false);
  }, [skippedBattle, setSkipping]);
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
  const showChoices =
    node.kind === 'choice' &&
    (!gfl1Frame?.interaction ||
      gfl1Frame.interaction.kind === 'quiz' ||
      (gfl1Frame.interaction.kind === 'exploration' &&
        (textOnly || !gfl1Frame.interaction.spots.length)));
  const [sceneStatus, setSceneStatus] = useState({ node: '', ready: false });
  const [finishSceneVersion, setFinishSceneVersion] = useState(0);
  const [sceneReplay, setSceneReplay] = useState({
    episode: '',
    node: '',
    version: 0,
  });
  useEffect(() => {
    setSceneReplay((request) =>
      request.node &&
      (request.episode !== episode.id || request.node !== node.id)
        ? { ...request, node: '' }
        : request,
    );
  }, [episode.id, node.id]);
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
  const rememberedPath = useRef(save.frames);
  if (
    !save.frames.every(
      (frame, index) =>
        frame.node === rememberedPath.current[index]?.node &&
        JSON.stringify(frame.answers) ===
          JSON.stringify(rememberedPath.current[index]?.answers),
    )
  )
    rememberedPath.current = save.frames;
  const timeline = useMemo(
    () => readingTimeline(episode, save, rememberedPath.current),
    [episode, save],
  );
  const specialScenes = useMemo(
    () => sceneMarkers(episode, timeline.frames.at(-1)?.answers),
    [episode, timeline.frames],
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
      (!textOnly &&
        episode.renderer?.id === 'ba-scene' &&
        isBaScreenTextStep(episode.renderer.payload as BaProgram, node.id)) ||
      revealed >= chars.length ||
      p.textSpeed === 0 ||
      node.kind !== 'text');
  const unsupported = fixture === 'unsupported' || node.kind === 'unsupported';
  const installed = isInstalled(store.data, episode);
  const installation = store.data.installations?.[episode.id];
  const installedMovieVariant =
    store.data.installed[episode.id] === true &&
    !!installation?.voices.length &&
    (!installation.variants ||
      installation.variants.some((variant) =>
        variant.startsWith(`${p.textVariant}:`),
      )) &&
    episode.nodes.some(
      (node) => node.movieStreams || node.femaleVideo?.streams,
    );
  const offline = fixture === 'offline' || !online;
  const expired = fixture === 'expired';
  const unavailable =
    offline &&
    !installed &&
    !installedMovieVariant &&
    episode.readingMode !== 'text';
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
  const canAutoRead =
    node.kind === 'text' || (showChoices && !!node.choices?.length);
  const autoReady =
    auto &&
    (textOnly || sceneReady) &&
    !panel &&
    !ui.active &&
    !hidden &&
    !blocked &&
    !unsupported &&
    complete &&
    canAutoRead &&
    !(p.waitVoice && activeVoice && !voiceDone && !voiceError);
  const autoChoicePending = autoReady && showChoices;
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
  const seek = (_frame: Frame, index: number, frames: Frame[]) => {
    pausePlayback();
    commit({
      ...latest.current,
      frames: frames.slice(0, index + 1),
      completed:
        episode.nodes.find((node) => node.id === _frame.node)?.kind === 'end',
      videoTime: 0,
      updatedAt: new Date().toISOString(),
    });
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
      pausePlayback();
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
  }, [params, episode, store.save, pausePlayback]);
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
      const pause = (
        node.scene.textPausesLocales?.[p.textLocale] ??
        node.scene.textPauses ??
        []
      ).reduce(
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
    p.textLocale,
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
    if (!autoReady) return;
    const frame = latest.current.frames.at(-1);
    const answer = autoChoicePending ? node.choices?.[0]?.id : undefined;
    const timer = setTimeout(() => {
      // Manual choices and navigation invalidate a pending answer immediately.
      if (latest.current.frames.at(-1) === frame) next(answer);
    }, p.autoDelay * 1000);
    return () => clearTimeout(timer);
  }, [autoReady, autoChoicePending, node.id, node.choices, p.autoDelay, next]);
  useEffect(() => {
    if (!canAutoRead || unsupported) setAuto(false);
  }, [canAutoRead, unsupported]);
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
    // Navigation can update the URL before React commits the new save state.
    // A quick rewind must use the passage just committed by the previous input.
    const current = latest.current;
    if (current.frames.length > 1)
      commit(rewind(current, current.frames.length - 2));
  }, [commit, setSkipping]);
  const retryScene = () => {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('fixture');
    navigate(`${location.pathname}?${nextParams}`, {
      replace: true,
      state: location.state,
    });
  };
  const setReadingLanguage = useCallback(
    (locale: typeof p.textLocale) => {
      if (!episode.textLocales?.includes(locale)) return;
      pausePlayback();
      store.preferences({
        games: {
          ...store.data.preferences.games,
          [episode.game]: {
            ...store.data.preferences.games?.[episode.game],
            textLocale: locale,
          },
        },
      });
    },
    [
      episode.game,
      episode.textLocales,
      pausePlayback,
      store.preferences,
      store.data.preferences.games,
    ],
  );
  const saveCheckpoint = useCallback(() => {
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
    store.notify(t('Checkpoint saved.'));
  }, [episode.id, speaker, text, save, store.setData, store.notify, t]);
  const execute = useCallback(
    (command: ReaderCommand) => {
      if (hidden && (command === 'next' || command === 'next-repeat')) {
        setHidden(false);
        return;
      }
      if (command.startsWith('choice-')) {
        if (!showChoices || !textReady || hidden || panel || ui.active) return;
        const answer =
          node.choices?.[Number(command.slice('choice-'.length)) - 1];
        if (answer) next(answer.id);
      } else if (command === 'next') next();
      else if (command === 'next-repeat') next(undefined, false, true);
      else if (command === 'previous') previous();
      else if (command === 'auto') {
        if (canAutoRead && !blocked && !unsupported) {
          setSkipping(false);
          setAuto((value) => !value);
        }
      } else if (command === 'skip') {
        setAuto(false);
        if (canSkip && !unsupported && !blocked) setSkipping((value) => !value);
        else
          store.notify(
            t('Fast-forward stops at choices, movies and unavailable scenes.'),
          );
      } else if (
        command === 'history' ||
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
        setMaximized((value) => !value);
      } else if (command === 'checkpoint') {
        saveCheckpoint();
      } else if (command.startsWith('language-')) {
        setReadingLanguage(
          command.slice('language-'.length) as typeof p.textLocale,
        );
      }
    },
    [
      hidden,
      showChoices,
      canAutoRead,
      textReady,
      panel,
      ui.active,
      saveCheckpoint,
      setReadingLanguage,
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
      t,
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
          aria-label={t('Search chapters')}
          value={query}
          placeholder={t('Find a chapter…')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <nav aria-label={t('Chapters')}>
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
                  <strong>{episodeTitle(e, p.catalogLocale)}</strong>
                  {branch ? (
                    <small>
                      {t('Side story')}
                      {branch.title ? ` · ${branch.title}` : ''}
                    </small>
                  ) : null}
                </span>
                {store.data.saves[e.id]?.completed ? <Check size={14} /> : null}
              </Link>
            ),
          );
          const chapterTitle = section.chapter
            ? localizedTitle(
                section.chapter.title,
                section.chapter.titleLocales,
                p.catalogLocale,
              )
            : '';
          return section.chapter ? (
            <details
              className="reader-chapter-section"
              key={`${section.id}:${!!query}`}
              open={!!query || section.id === episode.chapter?.id}
            >
              <summary>{chapterTitle}</summary>
              <nav aria-label={chapterTitle}>{links}</nav>
            </details>
          ) : (
            <nav key={section.id} aria-label={t('Event stories')}>
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
  const historyPath = new Set(save.frames.map((frame) => frame.node));
  const extraHistory = includeUnread
    ? episode.nodes.filter(
        (line) =>
          !historyPath.has(line.id) &&
          `${passageText(line, p).speaker} ${passageText(line, p).text}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!onlyBookmarks ||
            store.data.bookmarks.some(
              (point) =>
                point.episodeId === episode.id &&
                point.snapshot.frames.at(-1)?.node === line.id,
            )),
      )
    : [];
  const checkpoints = store.data.checkpoints.filter(
    (point) => point.episodeId === episode.id,
  );
  if (blocked)
    return (
      <main className="reader-gate">
        <Link className="back-link" to={from}>
          <ArrowLeft size={16} />
          {t('Back to stories')}
        </Link>
        <EmptyState
          title={
            linkError
              ? t('Passage unavailable')
              : expired
                ? t('Server session expired')
                : unavailable
                  ? t('This episode is not on this device')
                  : t('Download this episode')
          }
        >
          {linkError ||
            (expired
              ? t(
                  'Your local progress is safe. Reconnect to your private server or return to your device library.',
                )
              : unavailable
                ? t(
                    'The server is disconnected. Read an installed episode or reconnect to download this one.',
                  )
                : t(
                    'The sample media will be cached on this device. Downloads do not require a game installation.',
                  ))}
        </EmptyState>
        <div className="gate-actions">
          {linkError ? (
            <button
              onClick={() => {
                setLinkError('');
                commit(startSave(episode));
              }}
            >
              {t('Open episode from the start')}
            </button>
          ) : expired || unavailable ? (
            <>
              <button
                onClick={() => {
                  store.preferences({ source: 'device' });
                  navigate('/library');
                }}
              >
                {t('Return to device library')}
              </button>
              <button onClick={retryScene}>{t('Reconnect preview')}</button>
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
                  ? t('Downloading…')
                  : t('Download episode')}
              </button>
              <Link to="/manage">{t('View downloads')}</Link>
              {store.transfers[episode.id]?.status === 'failed' ? (
                <p role="alert">{store.transfers[episode.id].error}</p>
              ) : null}
            </>
          )}
        </div>
        {fixture !== 'normal' ? (
          <p className="page-note">
            {t('Design fixture · no private server is connected.')}
          </p>
        ) : null}
      </main>
    );
  return (
    <main
      className={`reader-page layout-${textOnly ? 'text' : p.layout} ${(p.dialogueOpacity ?? 1) < 0.5 ? 'dialogue-clear' : ''} ${hidden ? 'hide-ui' : ''} ${maximized ? 'reader-maximized' : ''}`}
      style={
        {
          '--game-accent': game.accent,
          '--reader-font-size': `${p.fontSize}px`,
          '--dialogue-opacity': p.dialogueOpacity ?? 1,
          '--chapter-width': `${p.panelWidth}px`,
        } as CSSProperties
      }
    >
      <header className="reader-header">
        <Link
          className="icon-link"
          to={from}
          state={returnState}
          aria-label={t('Back to stories')}
        >
          <ArrowLeft size={19} />
        </Link>
        <div>
          <strong>{episodeTitle(episode, p.catalogLocale)}</strong>
          <small>
            {textOnly ? (
              <span className="mobile-reading-mode">文字模式 · </span>
            ) : null}
            {game.name} <span> / </span>{' '}
            {localizedTitle(
              episode.story,
              episode.collectionLocales,
              p.catalogLocale,
            )}
          </small>
        </div>
        <span className="sample-label">
          {episode.game === 'gfl1' && episode.origin === 'game'
            ? textOnly
              ? t('English · Text mode')
              : t('English · Original scenes')
            : textOnly
              ? t(
                  episode.textLocales?.includes('ja')
                    ? 'Japanese · Text mode'
                    : 'Chinese · Text mode',
                )
              : episode.origin === 'game'
                ? episode.game === 'ba'
                  ? t('Japanese · Original scenes')
                  : episode.preview
                    ? t('Chinese · Original opening')
                    : t('Chinese · Original scenes')
                : t('Design fixture')}
        </span>
        {episode.origin === 'game' ? (
          <IconButton
            label={t('Story information')}
            onClick={() => open('information')}
          >
            <Info size={17} />
          </IconButton>
        ) : null}
        <IconButton
          label={maximized ? t('Restore reader') : t('Maximize reader')}
          shortcut="F11"
          aria-pressed={maximized}
          onClick={() => execute('fullscreen')}
        >
          <Maximize size={17} />
        </IconButton>
      </header>
      <div className="reading-workspace">
        {p.chaptersOpen && !narrow ? (
          <aside className="chapter-sidebar">
            <h2>{t('Chapters')}</h2>
            {chapterList}
          </aside>
        ) : null}
        <section
          className="scene-reader"
          ref={sceneRegion}
          aria-label={t('Story reader')}
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
            replayVersion={
              sceneReplay.episode === episode.id && sceneReplay.node === node.id
                ? sceneReplay.version
                : 0
            }
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
          {skippedBattle ? (
            <p className="battle-notice" role="note">
              {t(skippedBattle)}
            </p>
          ) : null}
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
          {showChoices && textReady ? (
            <div className="story-choices" aria-label={t('Choose a response')}>
              {autoChoicePending ? (
                <span id="auto-choice-status" className="sr-only" role="status">
                  {t('Choosing the first response in {seconds} seconds.', {
                    seconds: p.autoDelay,
                  })}
                </span>
              ) : null}
              {node.choices?.map((answer, i) => (
                <button
                  ref={i === 0 ? choice : undefined}
                  key={answer.id}
                  aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                  aria-describedby={
                    i === 0 && autoChoicePending
                      ? 'auto-choice-status'
                      : undefined
                  }
                  onClick={() => next(answer.id)}
                >
                  {i < 9 ? <kbd aria-hidden="true">{i + 1}</kbd> : null}
                  {i === 0 && autoChoicePending ? (
                    <LoaderCircle
                      aria-hidden="true"
                      size={18}
                      className={`auto-choice-spinner${p.reducedMotion ? '' : ' spin'}`}
                    />
                  ) : null}
                  {playerNameText(
                    (p.textVariant === 'female'
                      ? answer.femaleLabel?.[p.textLocale]
                      : undefined) ?? localizedText(answer.label, p.textLocale),
                    p,
                    node.playerName,
                  )}
                </button>
              ))}
            </div>
          ) : null}
          {unsupported ? (
            <div className="unsupported-notice" role="status">
              <AlertTriangle size={17} />
              <span>
                {t(
                  'This archive contains an unsupported or missing scene. It will not be skipped.',
                )}
              </span>
              <button onClick={() => open('history')}>
                {t('Read available text')}
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
                  aria-label={t('Bookmarked')}
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
                  {episode.completionLabel ?? t('Episode finished')}
                </span>
                <Link to={from} state={returnState}>
                  {t('Back to stories')}
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
                    {t('Next section ·')}{' '}
                    {episodeTitle(following, p.catalogLocale)}
                    <ChevronRight size={14} />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <StoryProgress
        frames={timeline.frames}
        upcoming={timeline.upcoming}
        total={timeline.total}
        choices={timeline.choices}
        locked={timeline.locked}
        current={save.frames.length - 1}
        onPause={pausePlayback}
        onSeek={seek}
        scenes={textOnly ? new Map() : specialScenes}
        onReplay={(frame, index, frames) => {
          setVideoDone(false);
          setRevealed(0);
          setSceneReplay((previous) => ({
            episode: episode.id,
            node: frame.node,
            version: previous.version + 1,
          }));
          seek(frame, index, frames);
        }}
      />
      <nav className="reader-toolbar" aria-label={t('Reading controls')}>
        <div className="toolbar-group">
          <IconButton
            label={
              p.chaptersOpen && !narrow ? t('Collapse chapters') : t('Chapters')
            }
            shortcut="Ctrl+C"
            aria-pressed={p.chaptersOpen && !narrow}
            onClick={() => execute('chapters')}
          >
            <PanelLeft size={18} />
          </IconButton>
          <IconButton
            label={t('History')}
            shortcut="Ctrl+H"
            onClick={() => open('history')}
          >
            <History size={18} />
          </IconButton>
          <IconButton
            label={bookmarked ? t('Remove bookmark') : t('Bookmark passage')}
            shortcut="B"
            aria-pressed={bookmarked}
            onClick={() => execute('bookmark')}
          >
            <Bookmark size={18} />
          </IconButton>
          <IconButton
            label={t('Save points')}
            className="checkpoint-button"
            onClick={() => open('saves')}
          >
            <Save size={18} />
          </IconButton>
        </div>
        <div className="toolbar-group playback-controls">
          <IconButton
            label={t('Previous passage')}
            shortcut="←"
            disabled={save.frames.length < 2}
            onClick={previous}
          >
            <ChevronLeft size={21} />
          </IconButton>
          <IconButton
            label={auto ? t('Pause auto reading') : t('Auto reading')}
            shortcut="A"
            aria-pressed={auto}
            disabled={!canAutoRead || unsupported}
            onClick={() => execute('auto')}
          >
            {auto ? <Pause size={20} /> : <Play size={20} />}
          </IconButton>
          <IconButton
            label={skipping ? t('Stop fast-forward') : t('Fast-forward')}
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
                ? t('Finish scene')
                : !complete
                  ? t('Reveal text')
                  : node.kind === 'end' && following?.id
                    ? t('Next section')
                    : t('Next passage')
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
            aria-label={t('Passage {number}', { number: save.frames.length })}
          >
            {String(save.frames.length).padStart(2, '0')}
          </span>
        </div>
        <div className="toolbar-group utility-controls">
          {(episode.textLocales ?? []).length > 1 ? (
            <select
              aria-label={t('Reading language')}
              value={p.textLocale}
              title={t('Chinese: C · Japanese: J · English: E')}
              onChange={(event) =>
                setReadingLanguage(event.target.value as typeof p.textLocale)
              }
            >
              {episode.textLocales!.map((locale) => (
                <option key={locale} value={locale}>
                  {{ en: 'English', ja: '日本語', 'zh-CN': '中文' }[locale]}
                </option>
              ))}
            </select>
          ) : null}
          <IconButton
            label={t('Commands & shortcuts')}
            shortcut="Ctrl+K"
            onClick={() => ui.open('commands')}
          >
            <Command size={18} />
          </IconButton>
          <IconButton
            label={t('Reader settings')}
            shortcut="Ctrl+,"
            onClick={() => ui.open('settings')}
          >
            <Settings2 size={18} />
          </IconButton>
          <IconButton
            label={t('Hide controls')}
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
            ? t('Voice unavailable. Reading can continue.')
            : t('Your browser paused audio.')}
          {audioBlocked ? (
            <IconButton
              label={t('Enable audio')}
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
          label={t('Show controls')}
          className="show-controls"
          onClick={() => setHidden(false)}
        >
          <Eye size={19} />
        </IconButton>
      ) : null}
      {maximized ? (
        <IconButton
          label={t('Restore reader')}
          shortcut="F11"
          className="restore-reader"
          onClick={() => setMaximized(false)}
        >
          <Maximize size={19} />
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
            ? t('History')
            : panel === 'chapters'
              ? t('Chapters')
              : panel === 'saves'
                ? t('Save points')
                : panel === 'information'
                  ? t('Story information')
                  : t('History')
        }
        description={
          panel === 'history'
            ? t('Jumping back restores that passage and its branch context.')
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
                aria-label={t('Search episode history')}
                placeholder={t('Find a passage…')}
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
              {t('Bookmarks only')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={includeUnread}
                onChange={(event) => setIncludeUnread(event.target.checked)}
              />
              {t('Include unread passages and alternate branches')}
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
              {extraHistory.map((line) => (
                <section className="history-unread" key={line.id}>
                  <small>
                    {passageText(line, p).speaker} ·{' '}
                    {save.seen.includes(line.id)
                      ? t('Alternate branch')
                      : t('Unread')}
                  </small>
                  <p>{passageText(line, p).text}</p>
                </section>
              ))}
              {!activeHistory.length && !extraHistory.length ? (
                <p className="field-note">{t('No matching passages.')}</p>
              ) : null}
            </div>
          </>
        ) : panel === 'saves' ? (
          <>
            <p className="field-note">
              {t(
                'Progress saves automatically. Named checkpoints keep a separate restorable reading state.',
              )}
            </p>
            <button onClick={saveCheckpoint}>
              <Save size={16} />
              {t('Save current point')}
            </button>
            <div className="checkpoint-list">
              {checkpoints.map((point) => (
                <article key={point.id}>
                  <div>
                    <strong>{point.label}</strong>
                    <small>
                      {new Date(point.createdAt).toLocaleString(uiLocale)}
                    </small>
                  </div>
                  <IconButton
                    label={t('Restore checkpoint')}
                    onClick={() => {
                      try {
                        commit(
                          resumeSave(episode, structuredClone(point.snapshot)),
                        );
                        setPanel(null);
                      } catch (error) {
                        store.notify(
                          t(
                            error instanceof Error
                              ? error.message
                              : 'This checkpoint is unavailable.',
                          ),
                        );
                      }
                    }}
                  >
                    <RotateCcw size={17} />
                  </IconButton>
                  <IconButton
                    label={t('Remove checkpoint')}
                    onClick={() => {
                      store.setData((old) => ({
                        ...old,
                        checkpoints: old.checkpoints.filter(
                          (s) => s.id !== point.id,
                        ),
                      }));
                      store.notify(t('Checkpoint removed.'), {
                        label: t('Undo'),
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
                {t('No named checkpoints for this episode yet.')}
              </p>
            ) : null}
          </>
        ) : panel === 'information' ? (
          <div className="story-information">
            <h3>
              {['gfl2-event', 'pjsk', 'gfl1', 'ba-scene'].includes(
                episode.renderer?.id ?? '',
              ) && !textOnly
                ? t('Original scene playback')
                : t('Original text reading')}
            </h3>
            <p>
              {episode.renderer?.id === 'pjsk' && !textOnly ? (
                t(
                  'This episode plays original Chinese text with Japanese voices, Live2D characters, motions, facial animation, backgrounds, music and sound effects. Browser transitions and timing approximate the original game.',
                )
              ) : episode.renderer?.id === 'gfl1' && !textOnly ? (
                t(
                  'This chapter uses original Steam global English text, backgrounds, portrait expressions, communication frames, music and sound effects. Portrait placement, transmission scanning and scene transitions approximate the game. A gameplay map is not imported; transmissions retain the previous illustrated background where available. Dialogue voices are not imported. Open the source script to inspect the original commands.',
                )
              ) : episode.renderer?.id === 'ba-scene' && !textOnly ? (
                t(
                  'This chapter plays original JP backgrounds, Spine character animations and expressions, Japanese dialogue voices, music and sound effects. Scene commands and waits follow the archived source script. Assets are stored locally and included in episode downloads.',
                )
              ) : episode.renderer?.id === 'gfl2-event' && !textOnly ? (
                t(
                  'This chapter plays recovered backgrounds, Live2D models, expressions, holograms and music in original script order. Movies support Chinese and Japanese audio. Regular dialogue has no voice track. Some Unity effects and browser rendering remain approximate.',
                )
              ) : (
                <>
                  {t(
                    'This chapter follows the recovered script rows with original text and speaker names. Character visuals, backgrounds, effects, voice and music are not played in this mode.',
                  )}
                </>
              )}
            </p>
            <p>
              {t(
                'All source commands are retained. Unknown control flow blocks import instead of being treated as ordinary dialogue.',
              )}
            </p>
            <dl>
              <dt>{t('Section')}</dt>
              <dd>
                {episode.order} · {episodeTitle(episode, p.catalogLocale)}
              </dd>
              <dt>{t('Current source')}</dt>
              <dd>
                {node.source?.script} {t('· row')} {node.source?.row}
              </dd>
              <dt>{t('Original passages')}</dt>
              <dd>{episode.nodes.length}</dd>
            </dl>
            {episode.sourceUrl ? (
              <a className="text-link" href={episode.sourceUrl} download>
                {t('Download original script data')}
              </a>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </main>
  );
}
