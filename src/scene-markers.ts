import type { Episode } from './model';
import type { BaProgram } from './playback/ba/types';
import { canonicalBaScript } from './playback/ba/script';

export type SceneMarkerKind = 'Camera sequence' | 'Movie' | 'Cutscene';

/** Explicit presentation sequences, not routine actor actions or transitions. */
export function sceneMarkers(episode: Episode) {
  const markers = new Map<string, SceneMarkerKind>();
  for (const node of episode.nodes)
    if (node.kind === 'video') markers.set(node.id, 'Movie');
  if (episode.renderer?.id === 'ba-scene') {
    const program = episode.renderer.payload as BaProgram;
    for (const step of program.steps) {
      const script = step.rows
        .map((row) => canonicalBaScript(row.ScriptKr))
        .join('\n');
      if (/^#timelineNS;/m.test(script)) markers.set(step.id, 'Cutscene');
      else if (/^#(?:video|videons2);/m.test(script))
        markers.set(step.id, 'Movie');
      else if (
        [
          ...script.matchAll(/^#(?:zmc|zmlt);move;[^;\n]+;[^;\n]+;(\d+)/gm),
        ].some((match) => Number(match[1]) > 10)
      )
        markers.set(step.id, 'Camera sequence');
    }
  }
  return markers;
}
