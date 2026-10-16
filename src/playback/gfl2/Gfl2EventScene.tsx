import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Volume2 } from 'lucide-react';
import { useStore } from '../../store';
import { IconButton } from '../../components/Primitives';
import { buildPathTimeline, buildTimeline } from './event-state';
import { EventStage } from './event-stage';
import { EventAudio } from './event-audio';
import type { EventProgram } from './event-types';
import { loadLive2D } from './resources';
export const preloadScene = () => loadLive2D().then(() => {});

export default function Gfl2EventScene({
  payload,
  index,
  fastForward,
  seekVersion,
  path,
}: {
  payload: unknown;
  index: number;
  fastForward: boolean;
  seekVersion: number;
  path: string[];
}) {
  const program = payload as EventProgram;
  const pathKey = path.join('|');
  const linearTimeline = useMemo(
    () =>
      program.steps.some((step) => step.incoming)
        ? null
        : buildTimeline(program),
    [program],
  );
  const timeline = useMemo(
    () =>
      linearTimeline ??
      buildPathTimeline(
        program,
        pathKey
          ? pathKey.split('|')
          : program.steps.slice(0, index + 1).map((s) => s.id),
      ),
    [program, linearTimeline, pathKey, index],
  );
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const host = useRef<HTMLDivElement>(null);
  const players = useRef<{
    stage: EventStage;
    audio: EventAudio | null;
  } | null>(null);
  const previous = useRef(-1);
  const previousSeek = useRef(seekVersion);
  const [blocked, setBlocked] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const notices = [
    ...new Set([
      ...problems,
      ...(timeline[index]?.warnings ?? []),
      ...program.unresolved.map(
        (item) => `Original ${item.kind} unavailable: ${item.label}`,
      ),
    ]),
  ];
  const {
    data: { preferences: p },
  } = useStore();
  const reduced =
    p.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = useRef({ index, fastForward, p, reduced });
  current.current = { index, fastForward, p, reduced };

  useEffect(() => {
    if (!host.current) return;
    const report = (message: string) =>
      setProblems((old) => (old.includes(message) ? old : [...old, message]));
    void preloadScene().catch(() =>
      report(
        'The Live2D runtime is unavailable. Backgrounds and text remain readable.',
      ),
    );
    let stage: EventStage;
    try {
      stage = new EventStage(host.current, program, report);
    } catch {
      report(
        'Scene rendering is unavailable in this browser. You can keep reading the original text.',
      );
      return;
    }
    let audio: EventAudio | null = null;
    try {
      audio = new EventAudio(program, report, setBlocked);
    } catch {
      report('Scene audio is unavailable in this browser.');
    }
    players.current = { stage, audio };
    Object.defineProperty(host.current, 'playbackDiagnostics', {
      configurable: true,
      get: () => ({
        ...stage.diagnostics,
        audio: audio?.diagnostics,
        index: current.current.index,
        warnings: timelineRef.current[current.current.index]?.warnings ?? [],
      }),
    });
    previous.current = -1;
    return () => {
      players.current = null;
      stage.dispose();
      audio?.dispose();
    };
  }, [program]);
  useEffect(() => {
    const player = players.current;
    const state = timeline[index];
    if (!player || !state) return;
    player.stage.configure(p.textVariant, reduced);
    player.audio?.configure(p.musicVolume, p.soundVolume);
    const changed = previous.current !== index;
    const instant =
      fastForward ||
      previousSeek.current !== seekVersion ||
      (previous.current === -1 ? index !== 0 : index !== previous.current + 1);
    player.stage.show(state, instant);
    player.audio?.update(state, { instant, changed });
    previous.current = index;
    previousSeek.current = seekVersion;
  }, [
    index,
    timeline,
    fastForward,
    seekVersion,
    p.textVariant,
    p.musicVolume,
    p.soundVolume,
    reduced,
  ]);
  return (
    <div className="stage native-stage event-stage" data-testid="scene-stage">
      <div ref={host} className="event-canvas" data-testid="native-layers" />
      {blocked ? (
        <div className="native-audio-control">
          <IconButton
            label="Enable scene audio"
            onClick={() =>
              void players.current?.audio
                ?.enable()
                .catch(() =>
                  setProblems((old) => [
                    ...old,
                    'Scene audio could not be enabled.',
                  ]),
                )
            }
          >
            <Volume2 size={19} />
          </IconButton>
        </div>
      ) : null}
      {notices.length ? (
        <details className="scene-notices">
          <summary aria-label="Scene notices">
            <AlertTriangle size={16} />
          </summary>
          <div role="status">
            {notices.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
