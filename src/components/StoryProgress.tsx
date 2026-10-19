import { useRef, useState, useId } from 'react';
import type { CSSProperties } from 'react';
import type { Frame } from '../model';

export function StoryProgress({
  frames,
  total,
  choices,
  locked,
  current,
  onSeek,
  onPause,
}: {
  frames: Frame[];
  total: number;
  choices: number[];
  locked: boolean;
  current: number;
  onSeek: (frame: Frame, index: number, frames: Frame[]) => void;
  onPause: () => void;
}) {
  const description = useId();
  const gesture = useRef<{
    frames: Frame[];
    total: number;
    index: number;
    choices: number[];
  } | null>(null);
  const [drag, setDrag] = useState<typeof gesture.current>(null);
  const path = drag?.frames ?? frames;
  const scale = drag?.total ?? total;
  const index = drag?.index ?? current;
  const marks = drag?.choices ?? choices;
  const percent = scale > 1 ? (index / (scale - 1)) * 100 : 0;
  const reachable = scale > 1 ? ((path.length - 1) / (scale - 1)) * 100 : 100;
  const finish = () => {
    gesture.current = null;
    setDrag(null);
  };
  return (
    <div
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
        aria-label="Story position"
        aria-describedby={description}
        aria-valuetext={
          locked
            ? `Passage ${index + 1}, ${path.length} reachable, choose an answer to continue`
            : `Passage ${index + 1} of ${path.length}`
        }
        min={0}
        max={Math.max(0, scale - 1)}
        step={1}
        value={index}
        disabled={path.length < 2}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onPause();
          gesture.current = { frames, total, index, choices };
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
      <span id={description} className="sr-only">
        {`${marks.length} choice ${marks.length === 1 ? 'point' : 'points'} on ${locked ? 'the estimated' : 'your selected'} route. `}
        {locked
          ? 'The shaded range is locked until you answer the next choice. The remaining length is an estimate of the longest route without repeated visits.'
          : 'Seek along your selected story route.'}
      </span>
    </div>
  );
}
