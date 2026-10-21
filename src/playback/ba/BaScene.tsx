import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useStore, usePlaybackPreferences } from '../../store';
import { BaStage } from './stage';
import { BaAudio } from './audio';
import { applyBaRow, initialBaState, rowDelay } from './state';
import type { BaProgram } from './types';
import { baTouchRegion } from './touch';
import { canonicalBaScriptLine } from './script';
import { baSoundForRow } from './source-gaps';
import { baEmotionSounds } from './emotion-sounds';
import { isBaScreenTextStep } from './screen-text';

export default function BaScene({
  payload,
  nodeId,
  fastForward,
  seekVersion,
  finishVersion,
  path,
  onReady,
  textComplete,
}: {
  payload: unknown;
  nodeId: string;
  fastForward: boolean;
  seekVersion: number;
  finishVersion: number;
  path: string[];
  onReady: (node: string, ready: boolean) => void;
  textComplete: boolean;
}) {
  const program = payload as BaProgram;
  const host = useRef<HTMLDivElement>(null);
  const players = useRef<{ stage: BaStage; audio: BaAudio | null } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [touchScript, setTouchScript] = useState('');
  const [cutscene, setCutscene] = useState<{
    path: string;
    reason: string;
  } | null>(null);
  const [sourceNotices, setSourceNotices] = useState<string[]>([]);
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });
  const [touchImage, setTouchImage] = useState({ width: 1920, height: 1080 });
  const touch = baTouchRegion(touchScript, viewport, touchImage);
  const resolveTouch = useRef<(() => void) | null>(null);
  const store = useStore();
  const p = usePlaybackPreferences();
  const sceneRow = (row: import('./types').BaRow) =>
    p.textLocale === 'en' && program.rowLocales?.en?.[row.row] !== undefined
      ? { ...row, TextJp: program.rowLocales.en[row.row] }
      : row;
  const reduced =
    p.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const previous = useRef({
    node: '',
    seek: seekVersion,
    finish: finishVersion,
    path: '',
  });
  const currentNode = useRef(nodeId);
  currentNode.current = nodeId;
  const pathKey = path.join('|');
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setViewport({ width, height });
      }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host.current) return;
    setLoaded(false);
    setError('');
    let active = true;
    let stage: BaStage;
    try {
      stage = new BaStage(host.current, program.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    let audio: BaAudio | null = null;
    try {
      audio = new BaAudio(
        program.assets,
        (message) => active && setError(message),
        (value) => active && setBlocked(value),
      );
    } catch {
      setError('Scene audio could not be initialized.');
    }
    players.current = { stage, audio };
    Object.defineProperty(host.current, 'playbackDiagnostics', {
      configurable: true,
      get: () => ({
        ...stage.diagnostics,
        audio: audio?.diagnostics,
        node: currentNode.current,
      }),
    });
    void Promise.all([stage.prepare(), audio?.prepare()])
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    previous.current = {
      node: '',
      seek: seekVersion,
      finish: finishVersion,
      path: '',
    };
    return () => {
      active = false;
      players.current = null;
      stage.dispose();
      audio?.dispose();
    };
  }, [program, attempt]);

  useEffect(() => {
    const player = players.current;
    if (!loaded || !player) return;
    player.stage.configure(reduced, p.textSpeed);
    player.audio?.configure(p.musicVolume, p.soundVolume);
  }, [loaded, reduced, p.musicVolume, p.soundVolume, p.textSpeed]);
  useEffect(() => {
    if (textComplete) players.current?.stage.revealCaptions();
  }, [textComplete, nodeId]);

  useEffect(() => {
    const player = players.current;
    if (!loaded || !player) return;
    const controller = new AbortController();
    const before = previous.current;
    const advancing = before.node && pathKey === `${before.path}|${nodeId}`;
    const silent =
      fastForward ||
      before.seek !== seekVersion ||
      before.finish !== finishVersion ||
      (!advancing && (before.node !== '' || program.steps[0].id !== nodeId));
    const instant = silent || reduced || isBaScreenTextStep(program, nodeId);
    previous.current = {
      node: nodeId,
      path: pathKey,
      seek: seekVersion,
      finish: finishVersion,
    };
    const byId = new Map(program.steps.map((s) => [s.id, s]));
    const current = byId.get(nodeId);
    if (!current) {
      setError('This scene does not match the current passage.');
      return;
    }
    let state = initialBaState();
    const previousPath = path.slice(0, -1);
    const leaving = advancing ? (byId.get(before.node)?.afterRows ?? []) : [];
    for (const id of previousPath) {
      const step = byId.get(id);
      for (const row of step?.rows ?? [])
        state = applyBaRow(state, sceneRow(row), program.assets);
      if (id !== before.node || !advancing)
        for (const row of step?.afterRows ?? [])
          state = applyBaRow(state, sceneRow(row), program.assets);
    }
    player.stage.finish();
    if (!advancing || silent) player.audio?.stopSounds();
    setBusy(true);
    setTouchScript('');
    setCutscene(null);
    setSourceNotices(
      [
        ...(program.assets.sourceGaps ?? []),
        ...(program.warnings ?? []).filter((warning) => warning.expression),
      ]
        .filter(
          (gap) =>
            gap.reason && current.rows.some((row) => row.row === gap.row),
        )
        .map((gap) => gap.reason!),
    );
    readyCallback.current(nodeId, false);
    const wait = (delay: number) =>
      new Promise<void>((resolve, reject) => {
        if (controller.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const handle = setTimeout(() => {
          controller.signal.removeEventListener('abort', stop);
          resolve();
        }, delay);
        const stop = () => {
          clearTimeout(handle);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        controller.signal.addEventListener('abort', stop, { once: true });
      });
    void (async () => {
      player.stage.show(state, true);
      if (!silent) player.audio?.setMusic(state.music);
      for (const row of [...leaving, ...current.rows]) {
        if (controller.signal.aborted) return;
        if (!instant) {
          const fade = player.stage.fadeOut(row, instant);
          if (fade) await wait(fade);
        }
        state = applyBaRow(state, sceneRow(row), program.assets);
        player.stage.show(state, instant);
        player.stage.moveCamera(row, instant);
        if (!silent) {
          player.audio?.setMusic(state.music);
          player.audio?.playSound(baSoundForRow(row, program.assets));
          for (const sound of baEmotionSounds(state))
            player.audio?.playSound(sound);
          if (row.BGEffect === 3134544579 && row.Sound !== 'UI_FX_BG_UnderFire')
            player.audio?.playSound('UI_FX_BG_UnderFire');
        }
        const transition = player.stage.transition(row, instant);
        const region = baTouchRegion(row.ScriptKr);
        if (region) {
          setTouchImage(player.stage.backgroundGeometry);
          await new Promise<void>((resolve, reject) => {
            const stop = () => {
              resolveTouch.current = null;
              reject(new DOMException('Aborted', 'AbortError'));
            };
            controller.signal.addEventListener('abort', stop, { once: true });
            resolveTouch.current = () => {
              controller.signal.removeEventListener('abort', stop);
              resolveTouch.current = null;
              setTouchScript('');
              resolve();
            };
            setTouchScript(row.ScriptKr);
          });
        }
        const timeline = row.ScriptKr.split('\n')
          .map(canonicalBaScriptLine)
          .find((line) => line.startsWith('#timelineNS;'))
          ?.split(';')[1];
        if (timeline) {
          const asset = program.assets.cutscenes?.[timeline];
          if (!asset || asset.supported !== false)
            throw new Error(`Missing cutscene declaration: ${timeline}`);
          await new Promise<void>((resolve, reject) => {
            const stop = () => {
              resolveTouch.current = null;
              reject(new DOMException('Aborted', 'AbortError'));
            };
            controller.signal.addEventListener('abort', stop, { once: true });
            resolveTouch.current = () => {
              controller.signal.removeEventListener('abort', stop);
              resolveTouch.current = null;
              setCutscene(null);
              resolve();
            };
            setCutscene({ path: timeline, reason: asset.reason });
          });
        }
        if (!instant) await wait(Math.max(transition, rowDelay(row)));
      }
      // Reconstruction can cross old BGM cues. Only apply its destination,
      // keeping the live source when seeking or fast-forward lands on the same track.
      if (instant)
        player.audio?.setMusic(nodeId.endsWith(':end') ? 999 : state.music);
      if (nodeId.endsWith(':end')) {
        player.audio?.setMusic(999);
        player.audio?.stopSounds();
      }
      if (!controller.signal.aborted) {
        setBusy(false);
        readyCallback.current(nodeId, true);
      }
    })().catch((e) => {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    });
    return () => controller.abort();
  }, [
    program,
    loaded,
    nodeId,
    pathKey,
    seekVersion,
    finishVersion,
    fastForward,
    reduced,
    p.textLocale,
  ]);

  return (
    <div
      className="stage native-stage ba-stage"
      data-testid="ba-scene"
      aria-busy={!loaded || busy}
    >
      <div className="ba-canvas" ref={host} />
      {cutscene ? (
        <div className="ba-cutscene-notice" role="status">
          <strong>3D cutscene unavailable</strong>
          <p>{cutscene.reason}</p>
          <button
            autoFocus
            onClick={(event) => {
              event.stopPropagation();
              resolveTouch.current?.();
            }}
          >
            Continue story
          </button>
        </div>
      ) : null}
      {sourceNotices.length ? (
        <div className="ba-source-notices" role="status">
          {[...new Set(sourceNotices)].map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}
      {touch ? (
        <button
          className="ba-touch-target"
          aria-label="Touch fingertips"
          style={{
            left: `${touch.left}%`,
            top: `${touch.top}%`,
            width: `${touch.width}%`,
            height: `${touch.height}%`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            resolveTouch.current?.();
          }}
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
      {!loaded && !error ? (
        <span className="ba-loading" role="status">
          Loading original scene…
        </span>
      ) : null}
      {blocked ? (
        <button
          className="ba-enable-audio"
          aria-label="Enable scene audio"
          onClick={() => {
            window.dispatchEvent(new Event('onlystory-enable-audio'));
            void players.current?.audio
              ?.enable()
              .catch((e) => setError(String(e)));
          }}
        >
          <Volume2 size={18} />
        </button>
      ) : null}
      {error ? (
        <div className="scene-notices" role="alert">
          {error}
          <button onClick={() => store.preferences({ layout: 'text' })}>
            Read text instead
          </button>
          <button onClick={() => setAttempt((a) => a + 1)}>Retry scene</button>
        </div>
      ) : null}
    </div>
  );
}
