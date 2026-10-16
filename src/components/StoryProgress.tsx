import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Frame } from '../model';

export function StoryProgress({
  frames,
  current,
  onSeek,
  onPause,
}: {
  frames: Frame[];
  current: string;
  onSeek: (frame: Frame) => void;
  onPause: () => void;
}) {
  const gesture = useRef<{ frames: Frame[]; index: number } | null>(null);
  const [drag, setDrag] = useState<typeof gesture.current>(null);
  // Keep the same scale during a drag, even when crossing a previous choice.
  const path = drag?.frames ?? frames;
  const index =
    drag?.index ??
    Math.max(
      0,
      path.findIndex((frame) => frame.node === current),
    );
  const percent = path.length > 1 ? (index / (path.length - 1)) * 100 : 0;
  const finish = () => {
    gesture.current = null;
    setDrag(null);
  };
  return (
    <input
      className="reader-progress"
      type="range"
      aria-label="Story position"
      aria-valuetext={`Passage ${index + 1} of ${path.length}`}
      min={0}
      max={Math.max(0, path.length - 1)}
      step={1}
      value={index}
      disabled={path.length < 2}
      style={{ '--story-progress': `${percent}%` } as CSSProperties}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        onPause();
        gesture.current = { frames, index };
        setDrag(gesture.current);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onChange={(event) => {
        const target = Number(event.currentTarget.value);
        const frame = (gesture.current?.frames ?? frames)[target];
        if (!frame) return;
        if (gesture.current) {
          gesture.current = { ...gesture.current, index: target };
          setDrag(gesture.current);
        }
        onPause();
        onSeek(frame);
      }}
    />
  );
}
