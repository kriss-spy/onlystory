import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { IconButton } from '../../components/Primitives';
import { useStore } from '../../store';
import { cachedResponse, loadLive2D } from '../gfl2/resources';
import { PjskPlayer } from './runtime';
import type { Program } from './types';

export const preloadScene = () => loadLive2D().then(() => {});

export default function PjskScene({
  payload,
  index,
  fastForward,
  seekVersion,
  onReadyChange,
  voiceLevel,
  movie,
}: {
  payload: unknown;
  index: number;
  fastForward: boolean;
  seekVersion: number;
  onReadyChange?: (value: boolean) => void;
  voiceLevel?: () => number;
  movie?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    caption = useRef<HTMLDivElement>(null);
  const player = useRef<PjskPlayer | null>(null);
  const [runtime, setRuntime] = useState<PjskPlayer | null>(null);
  const [problem, setProblem] = useState(''),
    [blocked, setBlocked] = useState(false),
    [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(true);
  const [preparedIndex, setPreparedIndex] = useState<number | null>(null);
  const {
    data: { preferences: p },
  } = useStore();
  const lastSeek = useRef(seekVersion);
  const url = (payload as { url: string }).url;
  useEffect(() => {
    const controller = new AbortController();
    let current: PjskPlayer | null = null;
    setRuntime(null);
    setPreparedIndex(null);
    setProblem('');
    setLoading(true);
    setBusy(true);
    onReadyChange?.(false);
    void (async () => {
      const program = (await (
        await cachedResponse(url, controller.signal)
      ).json()) as Program;
      controller.signal.throwIfAborted();
      if (program.version !== 1 || !program.steps.length)
        throw new Error('Invalid PJSK scene package.');
      if (!root.current || !caption.current) return;
      current = new PjskPlayer(
        root.current,
        program,
        caption.current,
        setProblem,
        setBlocked,
      );
      player.current = current;
      setRuntime(current);
      Object.defineProperty(root.current, 'playbackDiagnostics', {
        configurable: true,
        get: () => current?.diagnostics,
      });
    })().catch((error) => {
      if (!controller.signal.aborted) setProblem(error.message);
    });
    return () => {
      controller.abort();
      current?.dispose();
      player.current = null;
    };
  }, [url]);
  useEffect(() => {
    runtime?.configure(
      p.musicVolume,
      p.soundVolume,
      p.reducedMotion,
      voiceLevel,
    );
  }, [runtime, p.musicVolume, p.soundVolume, p.reducedMotion, voiceLevel]);
  useEffect(() => {
    if (!runtime) return;
    let active = true;
    const seek = lastSeek.current !== seekVersion;
    lastSeek.current = seekVersion;
    setBusy(true);
    onReadyChange?.(false);
    void runtime
      .show(index, fastForward, seek)
      .then(() => {
        if (active) {
          setLoading(false);
          setBusy(false);
          setPreparedIndex(index);
          onReadyChange?.(true);
        }
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setProblem(error.message);
      });
    return () => {
      active = false;
    };
  }, [runtime, index, seekVersion, fastForward]);
  return (
    <div
      className="stage native-stage pjsk-stage"
      data-testid="scene-stage"
      aria-busy={busy}
    >
      <div className="native-layers" ref={root} data-testid="pjsk-layers" />
      <div className="pjsk-caption" ref={caption} aria-live="polite" />
      {movie && preparedIndex === index && !busy ? (
        <div className="pjsk-movie">{movie}</div>
      ) : null}
      {problem ? (
        <div className="stage-message" role="alert">
          {problem}
        </div>
      ) : loading ? (
        <div className="pjsk-loading" role="status">
          Loading scene…
        </div>
      ) : null}
      {blocked ? (
        <div className="native-audio-control">
          <IconButton
            label="Enable scene audio"
            onClick={() => {
              void player.current
                ?.enableAudio()
                .catch(() => setProblem('Scene audio could not be enabled.'));
            }}
          >
            <Volume2 size={19} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
