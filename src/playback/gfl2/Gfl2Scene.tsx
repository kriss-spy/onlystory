import { playbackMessage } from '../messages';
import { useI18n } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { IconButton } from '../../components/Primitives';
import { usePlaybackPreferences } from '../../store';
import { Gfl2OpeningPlayer } from './runtime';
import type { Opening } from './types';

export function Gfl2Scene({
  payload,
  index,
}: {
  payload: unknown;
  index: number;
}) {
  const { t } = useI18n();
  const data = payload as Opening;
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<Gfl2OpeningPlayer | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [problem, setProblem] = useState('');
  const p = usePlaybackPreferences();
  useEffect(() => {
    if (!root.current) return;
    try {
      const runtime = new Gfl2OpeningPlayer(
        root.current,
        data,
        setProblem,
        setBlocked,
      );
      player.current = runtime;
      // Read-only state for local browser verification, scoped to this stage.
      Object.defineProperty(root.current, 'playbackDiagnostics', {
        configurable: true,
        get: () => runtime.diagnostics,
      });
      return () => {
        runtime.dispose();
        player.current = null;
      };
    } catch {
      setProblem('Scene audio is unavailable in this browser.');
    }
  }, [data]);
  useEffect(() => {
    player.current?.configure(
      p.musicVolume,
      p.soundVolume,
      p.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, [p.musicVolume, p.soundVolume, p.reducedMotion]);
  useEffect(() => {
    void player.current
      ?.show(index)
      .catch((error) => setProblem(error.message));
  }, [index, data]);
  return (
    <div className="stage native-stage" data-testid="scene-stage">
      <div className="native-layers" ref={root} data-testid="native-layers" />
      {problem ? (
        <div className="stage-message" role="status">
          {playbackMessage(t, problem)}
        </div>
      ) : null}
      {blocked ? (
        <div className="native-audio-control">
          <IconButton
            label={t('Enable scene audio')}
            onClick={() => {
              void player.current
                ?.enableAudio()
                .catch(() =>
                  setProblem('Your browser could not enable scene audio.'),
                );
            }}
          >
            <Volume2 size={19} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
