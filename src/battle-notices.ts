import boundaries from './battle-boundaries.json';
import type { Episode, StoryNode } from './model';

// Official BA ScenarioMode front/back groups delimit the omitted gameplay.
// Keep exact IDs: titles, numbering gaps and scene effects do not prove a battle.
export function battleNotice(episode: Episode, node: StoryNode) {
  if (
    node.kind === 'end' &&
    boundaries.some((pair) => pair.before === episode.id)
  )
    return 'Battle skipped. The next story continues after the battle.';
  if (
    node.id === (episode.entryNodeId ?? episode.nodes[0]?.id) &&
    boundaries.some((pair) => pair.after === episode.id)
  )
    return 'Battle skipped. This story continues after the battle.';
  return null;
}
