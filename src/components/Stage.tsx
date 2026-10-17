import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  LoaderCircle,
  RotateCw,
  SkipForward,
} from 'lucide-react';
import { backgroundUrl } from '../fixtures';
import { useMediaUrl } from '../hooks';
import type { Fixture, StoryNode } from '../model';
import { IconButton } from './Primitives';
import { useStore } from '../store';

function MovieSubtitle({
  track,
}: {
  track: NonNullable<StoryNode['videoSubtitles']>[number];
}) {
  const src = useMediaUrl(track.url);
  return src ? (
    <track
      kind="subtitles"
      src={src}
      srcLang={track.language}
      label={track.label}
      default={track.default}
    />
  ) : null;
}

export function Stage({
  node,
  fixture,
  game,
  videoTime,
  retry,
  onVideoEnd,
  onVideoTime,
  skipVideo,
  embedded = false,
}: {
  node: StoryNode;
  fixture: Fixture;
  game: string;
  videoTime: number;
  retry: () => void;
  onVideoEnd: () => void;
  onVideoTime: (time: number) => void;
  skipVideo: () => void;
  embedded?: boolean;
}) {
  const {
    data: { preferences },
  } = useStore();
  const src = useMediaUrl(
    node.kind === 'video'
      ? undefined
      : fixture === 'missing-background'
        ? '/demo/unavailable.svg'
        : backgroundUrl(node.scene.background),
  );
  const movieAsset =
    preferences.textVariant === 'female' && node.femaleVideo
      ? node.femaleVideo
      : {
          url: node.video,
          voices: node.videoVoices,
          subtitles: node.videoSubtitles,
        };
  const movie = useMediaUrl(
    node.kind === 'video'
      ? (movieAsset.voices?.[preferences.voice]?.url ?? movieAsset.url)
      : undefined,
  );
  const captions = useMediaUrl(
    node.kind === 'video' && !node.source ? '/demo/arrival.vtt' : undefined,
  );
  const [loaded, setLoaded] = useState('');
  const [failed, setFailed] = useState('');
  const [movieFailed, setMovieFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const currentTime = useRef(videoTime);
  const storedTime = useRef(videoTime);
  const appliedMovie = useRef<{ node: string; url: string } | undefined>(
    undefined,
  );
  const restore = useRef({ time: videoTime, playing: false, rate: 1 });
  const restoring = useRef(false);
  useEffect(() => {
    currentTime.current = videoTime;
    storedTime.current = videoTime;
  }, [node.id]);
  useEffect(() => {
    const player = video.current;
    if (!player || !movie) return;
    if (
      appliedMovie.current?.url === movie &&
      appliedMovie.current.node === node.id
    )
      return;
    const sameNode = appliedMovie.current?.node === node.id;
    if (!sameNode || !restoring.current)
      restore.current = {
        time: sameNode ? player.currentTime : videoTime,
        playing: sameNode && !player.paused && !player.ended,
        rate: sameNode ? player.playbackRate : 1,
      };
    restoring.current = true;
    appliedMovie.current = { node: node.id, url: movie };
    setMovieFailed(false);
    player.src = movie;
    player.load();
  }, [movie, node.id]);
  useEffect(() => {
    if (video.current) video.current.volume = preferences.voiceVolume;
  }, [preferences.voiceVolume, movie]);
  return (
    <div
      className={`stage effect-${node.scene.effect ?? 'none'}`}
      data-testid={embedded ? undefined : 'scene-stage'}
    >
      {src ? (
        <img
          className="scene-background"
          key={src}
          src={src}
          alt=""
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      ) : null}
      {node.kind !== 'video' ? (
        <div
          className={`actors ${node.scene.actors.length > 1 ? 'concurrent-actors' : ''}`}
        >
          {node.scene.actors.map((actor) => (
            <div
              className={`actor actor-${actor.position} expression-${actor.expression}`}
              key={actor.name}
              aria-label={`${actor.name}, ${actor.expression}`}
            >
              <svg
                viewBox="0 0 240 450"
                role="img"
                aria-label={`${actor.name}, original sample character stand-in`}
              >
                <defs>
                  <linearGradient
                    id={`coat-${game}-${actor.name}`}
                    x2=".8"
                    y2="1"
                  >
                    <stop stopColor="var(--game-accent)" />
                    <stop offset="1" stopColor="#263946" />
                  </linearGradient>
                </defs>
                <path
                  d="M40 450L48 245Q75 205 91 211H151Q183 217 198 251L222 450Z"
                  fill={`url(#coat-${game}-${actor.name})`}
                />
                <path
                  d="M78 136Q64 66 113 53Q175 42 175 131L159 185H89Z"
                  fill="#26343e"
                />
                <ellipse cx="124" cy="130" rx="44" ry="56" fill="#d2bba8" />
                <path
                  d="M76 119Q67 59 123 54Q175 55 176 124L149 92L127 115L113 87L91 121Z"
                  fill="#2b3b48"
                />
                <path
                  d="M106 178L102 212L122 236L147 213L143 179"
                  fill="#c1a994"
                />
                <path
                  d="M101 212L122 235L148 212L157 232L123 272L88 231Z"
                  fill="#e0dfd0"
                />
                <path
                  d="M123 272V445M60 306L96 326M185 306L149 326"
                  stroke="#263d48"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  d="M99 133h12M140 133h12"
                  stroke="#344650"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  className="actor-mouth"
                  d={
                    actor.expression === 'smile'
                      ? 'M116 154q9 9 18 0'
                      : actor.expression === 'surprised'
                        ? 'M121 151q7-5 9 3q-3 8-9-3'
                        : 'M117 156h15'
                  }
                  stroke="#87665d"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
              <span className="actor-name">{actor.name}</span>
            </div>
          ))}
        </div>
      ) : null}
      {(fixture === 'loading' || !src || loaded !== src) &&
      failed !== src &&
      node.kind !== 'video' ? (
        <div className="stage-message" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>Loading scene…</span>
          {fixture === 'loading' ? (
            <IconButton label="Retry scene" onClick={retry}>
              <RotateCw size={16} />
            </IconButton>
          ) : null}
        </div>
      ) : null}
      {failed === src && src ? (
        <div className="stage-message" role="status">
          <AlertTriangle size={16} />
          <span>Background unavailable. You can keep reading.</span>
          <IconButton label="Retry scene" onClick={retry}>
            <RotateCw size={16} />
          </IconButton>
        </div>
      ) : null}
      {node.kind === 'video' ? (
        <div className="movie-container">
          {node.performance && !movieFailed ? (
            <div className="song-performance" role="note">
              <h2>{node.performance.title}</h2>
              <p>{node.performance.notice}</p>
            </div>
          ) : null}
          {movieFailed ? (
            <div className="movie-error">
              <AlertTriangle />
              <p>The movie could not be loaded.</p>
              <button
                onClick={() => {
                  setMovieFailed(false);
                  video.current?.load();
                  retry();
                }}
              >
                <RotateCw size={16} />
                Retry
              </button>
            </div>
          ) : null}
          <video
            ref={video}
            hidden={movieFailed}
            controls
            playsInline
            preload="metadata"
            aria-label={
              node.performance
                ? 'Song performance'
                : node.source
                  ? 'Story movie'
                  : 'Sample archive recording'
            }
            onLoadedMetadata={() => {
              const player = video.current;
              if (!player) return;
              player.currentTime = Math.min(
                restore.current.time,
                player.duration || 0,
              );
              currentTime.current = player.currentTime;
              player.playbackRate = restore.current.rate;
              restoring.current = false;
              if (restore.current.playing) void player.play().catch(() => {});
            }}
            onTimeUpdate={() => {
              if (video.current && !restoring.current)
                currentTime.current = video.current.currentTime;
            }}
            onPause={() => {
              if (
                !restoring.current &&
                Math.abs(currentTime.current - storedTime.current) > 0.2
              ) {
                storedTime.current = currentTime.current;
                onVideoTime(currentTime.current);
              }
            }}
            onEnded={onVideoEnd}
            onError={() => setMovieFailed(true)}
          >
            {captions ? (
              <track
                kind="captions"
                src={captions}
                srcLang="en"
                label="English"
                default
              />
            ) : null}
            {movieAsset.subtitles?.map((track) => (
              <MovieSubtitle key={track.url} track={track} />
            ))}
          </video>
          <div className="movie-actions">
            <span>
              {node.performance
                ? 'Song performance · original audio'
                : node.source
                  ? 'Story movie'
                  : 'Sample recording · 6 seconds'}
            </span>
            <IconButton
              label={node.performance ? 'Continue story' : 'Skip this movie'}
              onClick={skipVideo}
            >
              <SkipForward size={18} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
