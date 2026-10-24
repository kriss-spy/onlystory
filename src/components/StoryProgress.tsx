import { useRef, useState, useId, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import type { Frame } from '../model';
import { useI18n } from '../i18n';
import type { SceneMarkerKind } from '../scene-markers';
import { IconButton } from './Primitives';
import { Clapperboard } from 'lucide-react';

export function StoryProgress({
  frames,
  upcoming,
  total,
  choices,
  locked,
  current,
  onSeek,
  onPause,
  scenes,
  onReplay,
}: {
  frames: Frame[];
  upcoming: { node: string; position: number }[];
  total: number;
  choices: number[];
  locked: boolean;
  current: number;
  onSeek: (frame: Frame, index: number, frames: Frame[]) => void;
  onPause: () => void;
  scenes: Map<string, SceneMarkerKind>;
  onReplay: (frame: Frame, index: number, frames: Frame[]) => void;
}) {
  const { t } = useI18n();
  const description = useId();
  const progress = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = progress.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const gesture = useRef<{
    frames: Frame[];
    total: number;
    index: number;
    choices: number[];
    upcoming: typeof upcoming;
  } | null>(null);
  const [drag, setDrag] = useState<typeof gesture.current>(null);
  const path = drag?.frames ?? frames;
  const scale = drag?.total ?? total;
  const index = drag?.index ?? current;
  const marks = drag?.choices ?? choices;
  const future = drag?.upcoming ?? upcoming;
  const scenePositions = [
    ...path.map((frame, position) => ({
      node: frame.node,
      position,
      available: true,
    })),
    ...future.map((item) => ({ ...item, available: false })),
  ]
    .filter((item) => scenes.has(item.node))
    .sort((a, b) => a.position - b.position);
  const laneEnds: number[] = [];
  const percent = scale > 1 ? (index / (scale - 1)) * 100 : 0;
  const reachable = scale > 1 ? ((path.length - 1) / (scale - 1)) * 100 : 100;
  const finish = () => {
    gesture.current = null;
    setDrag(null);
  };
  return (
    <div
      ref={progress}
      className="story-progress"
      style={
        {
          '--story-progress': `${percent}%`,
          '--story-reachable': `${reachable}%`,
        } as CSSProperties
      }
    >
      <input
        className="reader-progress"
        type="range"
        aria-label={t('Story position')}
        aria-describedby={description}
        aria-valuetext={
          locked
            ? t(
                'Passage {current}, {total} reachable, choose an answer to continue',
                { current: index + 1, total: path.length },
              )
            : t('Passage {current} of {total}', {
                current: index + 1,
                total: path.length,
              })
        }
        min={0}
        max={Math.max(0, scale - 1)}
        step={1}
        value={index}
        disabled={path.length < 2}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onPause();
          gesture.current = { frames, total, index, choices, upcoming };
          setDrag(gesture.current);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onChange={(event) => {
          const target = Math.min(
            Number(event.currentTarget.value),
            path.length - 1,
          );
          const frame = path[target];
          if (!frame) return;
          if (gesture.current) {
            gesture.current = { ...gesture.current, index: target };
            setDrag(gesture.current);
          }
          onPause();
          onSeek(frame, target, path);
        }}
      />
      <div className="choice-markers" aria-hidden="true">
        {marks.map((choice) => (
          <span
            key={choice}
            style={{ left: `${scale > 1 ? (choice / (scale - 1)) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="scene-markers">
        {scenePositions.map(({ node, position, available }) => {
          const kind = scenes.get(node)!;
          const percent = scale > 1 ? (position / (scale - 1)) * 100 : 0;
          const x = Math.max(
            6,
            Math.min(width - 18, (percent / 100) * (width - 12)),
          );
          let lane = laneEnds.findIndex((end) => x - end >= 28);
          if (lane < 0) lane = laneEnds.length;
          laneEnds[lane] = x;
          return (
            <IconButton
              key={`${node}:${position}`}
              className="scene-marker"
              aria-disabled={!available}
              data-scene-node={node}
              label={t(
                available
                  ? 'Replay {scene} at passage {passage}'
                  : '{scene} near passage {passage} · Answer earlier choices to replay',
                {
                  scene: t(kind),
                  passage: position + 1,
                },
              )}
              style={{
                left: `clamp(6px, ${percent}%, calc(100% - 6px))`,
                bottom: `${6 + lane * 38}px`,
              }}
              onClick={() => {
                if (!available) return;
                const frame = path[position];
                if (!frame || frame.node !== node) return;
                onPause();
                onReplay(frame, position, path);
              }}
            >
              <Clapperboard size={13} />
            </IconButton>
          );
        })}
      </div>
      <span id={description} className="sr-only">
        {locked
          ? t(
              marks.length === 1
                ? '{count} choice point on the estimated route. '
                : '{count} choice points on the estimated route. ',
              { count: marks.length },
            )
          : t(
              marks.length === 1
                ? '{count} choice point on your selected route. '
                : '{count} choice points on your selected route. ',
              { count: marks.length },
            )}
        {locked
          ? t(
              'The shaded range is locked until you answer the next choice. The remaining length is an estimate of the longest route without repeated visits.',
            )
          : t('Seek along your selected story route.')}
      </span>
    </div>
  );
}
