import type { ComponentProps } from 'react';
import { lazy, Suspense } from 'react';
import type { Episode } from '../model';
import { Gfl2Scene } from '../playback/gfl2/Gfl2Scene';
import { Stage } from './Stage';
const Gfl2EventScene = lazy(() => import('../playback/gfl2/Gfl2EventScene'));

export function SceneHost({
  episode,
  fastForward = false,
  textOnly = false,
  seekVersion = 0,
  path = [],
  ...props
}: ComponentProps<typeof Stage> & {
  episode: Episode;
  fastForward?: boolean;
  textOnly?: boolean;
  seekVersion?: number;
  path?: string[];
}) {
  if (props.node.kind === 'video') return <Stage {...props} />;
  if (textOnly) return null;
  if (episode.renderer?.id === 'gfl2-event')
    return (
      <Suspense
        fallback={
          <div className="stage native-stage" role="status">
            Loading scene…
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
          This story requires an unavailable scene renderer.
        </div>
      </div>
    );
  return <Stage {...props} />;
}
