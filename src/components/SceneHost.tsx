import type { ComponentProps } from 'react';
import { lazy, Suspense } from 'react';
import type { Episode } from '../model';
import { Gfl2Scene } from '../playback/gfl2/Gfl2Scene';
import { Stage } from './Stage';
import { Gfl1Scene } from '../playback/gfl1/Gfl1Scene';
import { useStore } from '../store';
import { useI18n } from '../i18n';
const Gfl2EventScene = lazy(() => import('../playback/gfl2/Gfl2EventScene'));
const PjskScene = lazy(() => import('../playback/pjsk/PjskScene'));
const BaScene = lazy(() => import('../playback/ba/BaScene'));

export function SceneHost({
  episode,
  fastForward = false,
  textOnly = false,
  seekVersion = 0,
  path = [],
  onReadyChange,
  voiceLevel,
  finishVersion = 0,
  onSceneReady,
  textComplete = false,
  ...props
}: ComponentProps<typeof Stage> & {
  episode: Episode;
  fastForward?: boolean;
  textOnly?: boolean;
  seekVersion?: number;
  path?: string[];
  onReadyChange?: (value: boolean) => void;
  voiceLevel?: () => number;
  finishVersion?: number;
  onSceneReady?: (node: string, ready: boolean) => void;
  textComplete?: boolean;
}) {
  const { t } = useI18n();
  const {
    data: { preferences },
  } = useStore();
  if (
    props.node.kind === 'video' &&
    (episode.renderer?.id !== 'pjsk' || textOnly)
  )
    return <Stage {...props} />;
  if (textOnly) return null;
  if (episode.renderer?.id === 'pjsk')
    return (
      <Suspense
        fallback={
          <div className="stage native-stage" role="status">
            {t('Loading scene…')}
          </div>
        }
      >
        <PjskScene
          payload={episode.renderer.payload}
          index={props.node.source?.index ?? 0}
          fastForward={fastForward}
          seekVersion={seekVersion}
          onReadyChange={onReadyChange}
          voiceLevel={voiceLevel}
          movie={
            props.node.kind === 'video' ? (
              <Stage {...props} embedded />
            ) : undefined
          }
        />
      </Suspense>
    );
  if (episode.renderer?.id === 'gfl1')
    return (
      <Gfl1Scene
        payload={episode.renderer.payload}
        nodeId={props.node.id}
        reducedMotion={preferences.reducedMotion || fastForward}
        seekVersion={seekVersion}
      />
    );
  if (episode.renderer?.id === 'ba-scene' && onSceneReady)
    return (
      <Suspense
        fallback={
          <div className="stage native-stage" role="status">
            {t('Loading scene…')}
          </div>
        }
      >
        <BaScene
          payload={episode.renderer.payload}
          nodeId={props.node.id}
          fastForward={fastForward}
          seekVersion={seekVersion}
          finishVersion={finishVersion}
          path={path}
          onReady={onSceneReady}
          textComplete={textComplete}
        />
      </Suspense>
    );
  if (episode.renderer?.id === 'gfl2-event')
    return (
      <Suspense
        fallback={
          <div className="stage native-stage" role="status">
            {t('Loading scene…')}
          </div>
        }
      >
        <Gfl2EventScene
          payload={episode.renderer.payload}
          index={props.node.source?.index ?? 0}
          fastForward={fastForward}
          seekVersion={seekVersion}
          path={path}
        />
      </Suspense>
    );
  if (episode.renderer?.id === 'text-only') return null;
  if (episode.renderer?.id === 'gfl2-avg-excerpt')
    return (
      <Gfl2Scene
        payload={episode.renderer.payload}
        index={props.node.source?.index ?? 0}
      />
    );
  if (episode.renderer)
    return (
      <div className="stage">
        <div className="stage-message" role="status">
          {t('This story requires an unavailable scene renderer.')}
        </div>
      </div>
    );
  return <Stage {...props} />;
}
