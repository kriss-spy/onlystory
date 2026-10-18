import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMediaUrl } from '../../hooks';
import type { Gfl1Frame, Gfl1Program } from './story';
import type { CSSProperties } from 'react';

function OriginalImage({
  url,
  name,
  className,
  style,
}: {
  url?: string;
  name: string;
  className: string;
  style?: CSSProperties;
}) {
  const src = useMediaUrl(url);
  const [failed, setFailed] = useState('');
  if (!url || failed === url)
    return (
      <span className="gfl1-missing" role="status">
        Missing original image: {name}
      </span>
    );
  return src ? (
    <img
      src={src}
      alt={name}
      draggable={false}
      className={className}
      style={style}
      onError={() => setFailed(url)}
    />
  ) : null;
}
function Portrait({
  actor,
  communication,
  still = false,
}: {
  actor: Gfl1Frame['actors'][number];
  communication: Gfl1Program['communication'];
  still?: boolean;
}) {
  const frameUrl = useMediaUrl(communication?.frameUrl);
  const markerUrl = useMediaUrl(communication?.markerUrl);
  const fadeClass =
    actor.fade && !still ? ` gfl1-actor-fade-${actor.fade.kind}` : '';
  const actorStyle = {
    left: `${(actor.x ?? 0) / 20.48}%`,
    bottom: `${(actor.y ?? 0) / 11.52}%`,
    transform: `scale(${actor.scale ?? 1})`,
    opacity: still && actor.fade?.kind === 'out' ? 0 : actor.opacity,
    '--gfl1-actor-opacity': actor.opacity ?? 1,
    '--gfl1-actor-fade-duration': `${actor.fade?.duration ?? 0}s`,
    '--gfl1-actor-delay': `${actor.delay ?? 0}s`,
  } as CSSProperties;
  if (actor.communication)
    return (
      <div className={`gfl1-transmission-shell${fadeClass}`} style={actorStyle}>
        <div
          className="gfl1-transmission"
          role="img"
          aria-label={`Transmission from ${actor.name}`}
        >
          <div className="gfl1-transmission-screen">
            <OriginalImage
              url={actor.url}
              name={`${actor.name}, expression ${actor.expression}`}
              className="gfl1-transmission-character"
            />
            <span className="gfl1-transmission-scan" aria-hidden="true" />
          </div>
          <span
            className="gfl1-transmission-border"
            aria-hidden="true"
            style={
              frameUrl ? { borderImageSource: `url("${frameUrl}")` } : undefined
            }
          />
          <span
            className="gfl1-transmission-marker"
            aria-hidden="true"
            style={
              markerUrl ? { backgroundImage: `url("${markerUrl}")` } : undefined
            }
          />
        </div>
      </div>
    );
  return (
    <div
      className={`gfl1-portrait${actor.active ? ' speaking' : ''}${actor.grey ? ' gfl1-grey' : ''}${actor.shake ? ' gfl1-actor-shake' : ''}${fadeClass}`}
      style={actorStyle}
    >
      <OriginalImage
        url={actor.url}
        name={`${actor.name}, expression ${actor.expression}`}
        className="gfl1-character"
      />
    </div>
  );
}

function Montage({
  flash,
  communication,
  reducedMotion,
}: {
  flash: NonNullable<Gfl1Frame['flash']>;
  communication: Gfl1Program['communication'];
  reducedMotion: boolean;
}) {
  const [step, setStep] = useState(-1);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    let cycle: number | undefined;
    const start = window.setTimeout(
      () => {
        setStep(0);
        if (!reducedMotion)
          cycle = window.setInterval(
            () => setStep((value) => value + 1),
            1000 / Math.max(1, Math.min(8, flash.rate)),
          );
      },
      Math.max(0, flash.delay) * 1000,
    );
    const end = window.setTimeout(
      () => setFinished(true),
      Math.max(0.1, flash.duration + flash.delay) * 1000,
    );
    return () => {
      clearTimeout(start);
      clearInterval(cycle);
      clearTimeout(end);
    };
  }, [flash, reducedMotion]);
  if (finished || step < 0) return null;
  if (!flash.backgrounds.length && !flash.portraits.length)
    return reducedMotion ? null : (
      <span className="gfl1-flash" aria-hidden="true" />
    );
  const background = flash.backgrounds[step % flash.backgrounds.length];
  const actors = flash.portraits[step % flash.portraits.length] ?? [];
  return (
    <div
      className="gfl1-montage"
      aria-label="Memory montage"
      style={{
        backgroundColor:
          background?.color ?? (background ? '#0b0d12' : 'transparent'),
      }}
    >
      {background?.url ? (
        <OriginalImage
          url={background.url}
          name={background.name}
          className="scene-background"
        />
      ) : null}
      <div className="gfl1-portraits">
        {actors.map((actor, index) => (
          <Portrait
            key={`${actor.name}:${index}`}
            actor={actor}
            communication={communication}
            still={reducedMotion}
          />
        ))}
      </div>
    </div>
  );
}
export function Gfl1Scene({
  payload,
  nodeId,
  reducedMotion,
  seekVersion = 0,
}: {
  payload: unknown;
  nodeId: string;
  reducedMotion: boolean;
  seekVersion?: number;
}) {
  const program = payload as Gfl1Program;
  const previousLocation = useRef({ nodeId, seekVersion });
  const [animatePassage, setAnimatePassage] = useState(false);
  useLayoutEffect(() => {
    setAnimatePassage(
      previousLocation.current.nodeId !== nodeId &&
        previousLocation.current.seekVersion === seekVersion,
    );
    previousLocation.current = { nodeId, seekVersion };
  }, [nodeId, seekVersion]);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const still = reducedMotion || systemReducedMotion;
  const frame = program.frames[nodeId];
  if (!frame) return <div className="stage gfl1-stage" />;
  const background = frame.contextBackground ?? frame.background;
  const gameplayShade =
    frame.contextBackground &&
    frame.background.name.toLowerCase() === 'white' &&
    !frame.blackout;
  const transmitting = frame.actors.some((actor) => actor.communication);
  return (
    <div
      className={`stage gfl1-stage${transmitting ? ' gfl1-transmitting' : ''}${gameplayShade ? ' gfl1-gameplay-underlay' : ''}${still ? ' gfl1-static' : ''}${(frame.shake || frame.controlledShake) && !still ? ' gfl1-shake' : ''}${frame.night ? ' gfl1-night' : ''}${frame.mask ? ' gfl1-memory' : ''}${frame.border ? ' gfl1-bordered' : ''}`}
      data-testid="gfl1-stage"
      style={
        {
          backgroundColor: background.color ?? '#101115',
          ...(frame.controlledShake && !still
            ? {
                animationDuration: `${frame.controlledShake.duration}s`,
                animationDelay: `${frame.controlledShake.delay}s`,
                '--gfl1-shake-range': `${frame.controlledShake.range}px`,
              }
            : {}),
        } as CSSProperties
      }
    >
      {background.url ? (
        <OriginalImage
          url={background.url}
          name={background.name}
          className="scene-background"
          style={
            frame.backgroundMove
              ? {
                  transform: `scale(${frame.backgroundMove.scale})`,
                  transformOrigin: `${frame.backgroundMove.pivotX * 100}% ${frame.backgroundMove.pivotY * 100}%`,
                  transition:
                    still || !animatePassage
                      ? undefined
                      : `transform ${frame.backgroundMove.duration}s linear`,
                }
              : undefined
          }
        />
      ) : !background.color ? (
        <span className="gfl1-missing" role="status">
          Missing original background: {background.name}
        </span>
      ) : null}
      {gameplayShade && frame.background.url ? (
        <OriginalImage
          url={frame.background.url}
          name="Original gameplay shade"
          className="gfl1-background-shade"
        />
      ) : null}
      <div className="gfl1-portraits">
        {frame.actors.map((actor, index) => (
          <Portrait
            key={`${actor.name}:${index}`}
            actor={actor}
            communication={program.communication}
            still={still || !animatePassage}
          />
        ))}
      </div>
      {frame.flash ? (
        <Montage
          key={nodeId}
          flash={frame.flash}
          communication={program.communication}
          reducedMotion={still}
        />
      ) : null}
      {frame.sparks ? <div className="gfl1-sparks" aria-hidden="true" /> : null}
      {frame.effects?.includes('snow') ? (
        <div className="gfl1-snow" aria-hidden="true" />
      ) : null}
      {frame.blackout ? (
        <div
          key={nodeId}
          className="gfl1-curtain"
          aria-hidden="true"
          style={{
            backgroundColor: frame.blackout.color,
            animationDuration: `${still || !animatePassage ? 0 : frame.blackout.duration}s`,
          }}
        />
      ) : null}
      {frame.effects?.includes('credits') ? (
        <span className="gfl1-source-note" role="status">
          The original rolling credits are unavailable. The source script is
          preserved in Story information.
        </span>
      ) : null}
      {frame.nativeEffects?.length ? (
        <span className="gfl1-source-note" role="status">
          An original visual effect in this scene is not available yet. Dialogue
          remains available.
        </span>
      ) : null}
    </div>
  );
}
