import type { Episode } from './model';
import type { BaProgram } from './playback/ba/types';
import { canonicalBaScript } from './playback/ba/script';

export type SceneMarkerKind = 'Movie' | 'CG scene';
type BackgroundKind = 'cg' | 'ordinary' | 'neutral';

// This fight continues through a brief return to ordinary train dialogue.
// The source has no scene boundary metadata for this narrative continuation.
const cgContinuations: Readonly<Record<string, string>> = {
  '13290:92': '13290:51',
};

function backgroundKind(
  asset: BaProgram['assets']['backgrounds'][string],
): BackgroundKind {
  const name = asset.name.split(/[/\\]/).pop() || '';
  if (
    /^BG_CS_/i.test(name) ||
    (asset.renderer === 'spine' && /^SC\d+(?:_|$)/i.test(name))
  )
    return 'cg';
  if (/^BG_(?:Black|White)(?:\.|$)/i.test(name)) return 'neutral';
  return 'ordinary';
}

/** One entry per illustrated sequence, preserving separate movies and routes. */
export function sceneMarkers(
  episode: Episode,
  answers: Record<string, string> = {},
) {
  const markers = new Map<string, SceneMarkerKind>();
  for (const node of episode.nodes)
    if (node.kind === 'video') markers.set(node.id, 'Movie');
  if (episode.renderer?.id !== 'ba-scene') return markers;

  const program = episode.renderer.payload as BaProgram;
  const steps = new Map(program.steps.map((step) => [step.id, step]));
  const nodes = new Map(episode.nodes.map((node) => [node.id, node]));
  const nextStep = new Map(
    program.steps
      .slice(0, -1)
      .map((step, index) => [step.id, program.steps[index + 1].id]),
  );
  const candidates = new Map(markers);
  markers.clear();
  const pending: { id: string; active: boolean; background: BackgroundKind }[] =
    [];
  const entry =
    episode.entryNodeId || episode.nodes[0]?.id || program.steps[0]?.id;
  if (entry) pending.push({ id: entry, active: false, background: 'ordinary' });
  const visited = new Set<string>();
  while (pending.length) {
    let { id, active, background } = pending.pop()!;
    const key = `${id}:${active}:${background}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const node = nodes.get(id);
    for (const row of steps.get(id)?.rows || []) {
      const script = canonicalBaScript(row.ScriptKr);
      if (/^#(?:place|title|nextepisode);/m.test(script)) active = false;
      const asset = program.assets?.backgrounds[String(row.BGName)];
      if (asset) {
        background = backgroundKind(asset);
        if (background === 'cg') {
          if (!active && candidates.get(id) !== 'Movie')
            candidates.set(id, 'CG scene');
          active = true;
        }
      }
      if (/^#(?:video|videons2);/m.test(script)) {
        candidates.set(id, 'Movie');
        active = false;
        background = 'neutral';
      }
    }
    // Background flashes inside a montage don't split it. An ordinary
    // backdrop that reaches a reader passage does end the illustrated run.
    if (background === 'ordinary' || node?.kind === 'video') active = false;
    const selected = node?.choices?.find((choice) => choice.id === answers[id]);
    const successors = node
      ? node.kind === 'choice' && node.choices?.length
        ? selected
          ? [selected.next]
          : node.choices.map((choice) => choice.next)
        : node.next
          ? [node.next]
          : []
      : nextStep.has(id)
        ? [nextStep.get(id)!]
        : [];
    for (const next of successors)
      pending.push({ id: next, active, background });
  }
  for (const step of program.steps) {
    const kind = candidates.get(step.id);
    if (kind) markers.set(step.id, kind);
  }
  for (const [id, kind] of candidates)
    if (!steps.has(id)) markers.set(id, kind);
  for (const [continuation, start] of Object.entries(cgContinuations))
    if (
      markers.get(start) === 'CG scene' &&
      markers.get(continuation) === 'CG scene'
    )
      markers.delete(continuation);
  return markers;
}
