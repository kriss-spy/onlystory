import { useEffect, useRef, useState } from 'react';
import { useMediaUrl } from '../../hooks';
import type { Gfl1Frame, Gfl1Program } from './story';

type Sound = NonNullable<Gfl1Frame['sounds']>[number];
function EffectChannel({
  channel,
  cue,
  activeCue,
  nodeId,
  seekVersion,
  enabled,
  volume,
  onBlocked,
}: {
  channel: Sound['channel'];
  cue?: Sound;
  activeCue?: Sound;
  nodeId: string;
  seekVersion: number;
  enabled: boolean;
  volume: number;
  onBlocked: (blocked: boolean) => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<Sound & { key: string }>();
  const [failed, setFailed] = useState('');
  const src = useMediaUrl(track?.url);
  // Natural advancement lets a one-shot finish. A seek, fast-forward, end or
  // unmount cancels it, so a past gunshot cannot leak into a restored scene.
  useEffect(() => {
    setTrack(
      enabled && activeCue
        ? { ...activeCue, key: `restore:${nodeId}:${seekVersion}` }
        : undefined,
    );
    setFailed('');
    return () => player.current?.pause();
  }, [seekVersion, enabled]);
  useEffect(() => {
    if (enabled && cue) {
      setTrack(
        cue.action === 'stop'
          ? undefined
          : { ...cue, key: `${nodeId}:${seekVersion}` },
      );
      setFailed('');
    }
  }, [cue, nodeId, seekVersion, enabled]);
  useEffect(() => {
    if (player.current) player.current.volume = volume;
  }, [volume, track?.key]);
  useEffect(() => {
    const audio = player.current;
    if (!audio || !src || !track || !enabled) return;
    const play = () => {
      void audio.play().catch((error) => {
        if (error.name === 'NotAllowedError') onBlocked(true);
        else if (error.name !== 'AbortError') setFailed(track.cue);
      });
    };
    play();
    window.addEventListener('onlystory:enable-audio', play);
    return () => {
      window.removeEventListener('onlystory:enable-audio', play);
      audio.pause();
    };
  }, [src, track?.key, enabled, onBlocked]);
  return (
    <>
      <audio
        key={track?.key}
        ref={player}
        src={src}
        loop={track?.loop ?? false}
        data-testid={`gfl1-sfx-${channel}`}
        data-cue={track?.cue}
        onEnded={() => setTrack(undefined)}
        onError={() => {
          if (track) setFailed(track.cue);
        }}
      />
      {failed ? (
        <span className="audio-status" role="status">
          Sound effect unavailable: {failed}
        </span>
      ) : null}
    </>
  );
}

export function Gfl1Effects({
  payload,
  nodeId,
  seekVersion,
  enabled,
  volume,
  onBlocked,
}: {
  payload: unknown;
  nodeId: string;
  seekVersion: number;
  enabled: boolean;
  volume: number;
  onBlocked: (blocked: boolean) => void;
}) {
  const frame = (payload as Gfl1Program).frames[nodeId];
  const sounds = frame?.sounds;
  return (
    <>
      {(['SE1', 'SE2'] as const).map((channel) => (
        <EffectChannel
          key={channel}
          channel={channel}
          cue={sounds?.filter((sound) => sound.channel === channel).at(-1)}
          activeCue={frame?.activeSounds?.find(
            (sound) => sound.channel === channel,
          )}
          nodeId={nodeId}
          seekVersion={seekVersion}
          enabled={enabled}
          volume={volume}
          onBlocked={onBlocked}
        />
      ))}
    </>
  );
}
