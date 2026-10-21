import { useI18n } from '../../i18n';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Locale, StoryNode } from '../../model';
import { useMediaUrl } from '../../hooks';
import type { Gfl1Interaction as Interaction } from './story';
const ShootingModels = lazy(() =>
  import('./Gfl1ShootingModels').then((module) => ({
    default: module.Gfl1ShootingModels,
  })),
);

function ShotAudio({
  cue,
  fired,
  volume,
  disabled,
}: {
  cue: Extract<Interaction, { kind: 'shoot' }>['audio'][number];
  fired: number;
  volume: number;
  disabled: boolean;
}) {
  const src = useMediaUrl(cue.url);
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!fired || !src || disabled) return;
    const audio = player.current!;
    const timer = window.setTimeout(() => {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }, cue.delay * 1000);
    return () => {
      clearTimeout(timer);
      audio.pause();
    };
  }, [fired, src, cue.delay, disabled]);
  useEffect(() => {
    if (player.current) player.current.volume = volume;
  }, [volume]);
  return <audio ref={player} src={src} data-cue={cue.cue} />;
}

export function Gfl1Interaction({
  interaction,
  choices,
  onAnswer,
  volume,
  disabled,
  textOnly,
  locale,
  reducedMotion,
}: {
  interaction: Interaction;
  choices: StoryNode['choices'];
  onAnswer: (answer: string) => void;
  volume: number;
  disabled: boolean;
  textOnly: boolean;
  locale: Locale;
  reducedMotion: boolean;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState(0);
  const [shots, setShots] = useState(0);
  const [firing, setFiring] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  useEffect(() => {
    if (!firing || interaction.kind !== 'shoot' || disabled) return;
    const duration = Math.max(
      0.2,
      ...interaction.audio.map((cue) => cue.delay),
      ...interaction.tweens.map((tween) => tween.delay),
    );
    const timer = window.setTimeout(
      () => {
        if (shots >= interaction.manualCount)
          onAnswerRef.current(interaction.answerId);
        else setFiring(false);
      },
      (duration + 0.25) * 1000,
    );
    return () => clearTimeout(timer);
  }, [firing, shots, interaction, disabled]);

  if (interaction.kind === 'password')
    return (
      <form
        className="gfl1-password"
        aria-label={t('Keycode lock')}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (code === interaction.password) onAnswer(interaction.answerId);
          else {
            setErrors((value) => value + 1);
            setCode('');
          }
        }}
      >
        <label htmlFor="gfl1-keycode">{t('Enter the keycode')}</label>
        <input
          id="gfl1-keycode"
          autoFocus
          autoComplete="off"
          inputMode="numeric"
          maxLength={interaction.password.length}
          value={code}
          disabled={disabled}
          onChange={(event) => setCode(event.target.value)}
          aria-describedby={errors ? 'gfl1-keycode-error' : undefined}
        />
        <button type="submit" disabled={disabled || !code}>
          {t('Unlock')}
        </button>
        {errors ? (
          <p id="gfl1-keycode-error" role="alert">
            {t('Incorrect keycode. Try again.')}
          </p>
        ) : null}
      </form>
    );
  if (interaction.kind === 'shoot')
    return (
      <div className="gfl1-shoot-panel" aria-label={t('Shooting scene')}>
        {interaction.models && !textOnly ? (
          <Suspense
            fallback={
              <p className="gfl1-source-note" role="status">
                {t('Loading original scene…')}
              </p>
            }
          >
            <ShootingModels
              interaction={interaction}
              fired={shots}
              reducedMotion={reducedMotion}
              onReady={() => setModelReady(true)}
            />
          </Suspense>
        ) : null}
        <div className="gfl1-shoot-controls">
          <button
            autoFocus
            disabled={
              disabled ||
              firing ||
              (!!interaction.models && !textOnly && !modelReady)
            }
            onClick={() => {
              setShots((value) => value + 1);
              setFiring(true);
            }}
          >
            {firing ? t('Firing…') : t('Fire')}
          </button>
          <p role="status">
            {shots} / {interaction.manualCount}
          </p>
          {interaction.audio.map((cue, index) => (
            <ShotAudio
              key={index}
              cue={cue}
              fired={shots}
              volume={volume}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    );
  if (
    interaction.kind !== 'exploration' ||
    textOnly ||
    !interaction.spots.length
  )
    return null;
  return (
    <div className="gfl1-investigation" aria-label={t('Inspect the scene')}>
      <p className="gfl1-investigation-tip">{interaction.tips}</p>
      {interaction.spots.map((spot, index) => {
        const answer = choices?.find((choice) => choice.id === spot.id);
        if (!answer) return null;
        return (
          <button
            key={spot.id}
            autoFocus={index === 0}
            className="gfl1-inspection-spot"
            style={
              {
                left: `${50 + (spot.x / 2048) * 100}%`,
                top: `${50 - (spot.y / 1152) * 100}%`,
              } as CSSProperties
            }
            disabled={disabled}
            onClick={() => onAnswer(spot.id)}
            aria-label={answer.label[locale]}
            title={answer.label[locale]}
          >
            ⌕<span>{spot.id}</span>
          </button>
        );
      })}
    </div>
  );
}
