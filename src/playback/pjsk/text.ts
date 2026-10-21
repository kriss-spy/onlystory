import type { Episode, StoryNode } from '../../model';
import { isPjskPlaybackAsset } from '../../downloads/pjsk-playback-files';

export function decodePjskText(payload: unknown, episode: Episode): Episode {
  const data = payload as {
    format?: string;
    id?: string;
    nodes?: StoryNode[];
    assets?: string[];
  } | null;
  const fail = () => {
    throw new Error(
      'The chapter text does not match this episode. Reimport the original scripts.',
    );
  };
  if (
    !data ||
    data.format !== 'pjsk-text-v1' ||
    data.id !== episode.id ||
    !Array.isArray(data.nodes) ||
    !data.nodes.length ||
    data.nodes.length !== episode.content?.count ||
    !Array.isArray(data.assets) ||
    data.assets.some(
      (url) =>
        typeof url !== 'string' ||
        (!url.startsWith('/private/pjsk/assets/') &&
          !/^\/private\/pjsk\/remote\/[a-f0-9]{64}\.mp3$/.test(url)),
    )
  )
    return fail();
  const ids = new Set(data.nodes.map((node) => node?.id));
  if (
    ids.size !== data.nodes.length ||
    data.nodes[0].id !== episode.entryNodeId ||
    data.nodes.some(
      (node) =>
        !node ||
        typeof node.id !== 'string' ||
        !['text', 'end', 'choice', 'video'].includes(node.kind) ||
        !node.text ||
        typeof node.text['zh-CN'] !== 'string' ||
        !node.scene ||
        (node.next !== undefined && !ids.has(node.next)) ||
        (node.kind === 'choice' &&
          (!node.choices?.length ||
            node.choices.some((choice) => !ids.has(choice.next)))),
    )
  )
    return fail();
  return {
    ...episode,
    nodes: data.nodes,
    assets: [...new Set([...episode.assets, ...data.assets])].filter(
      isPjskPlaybackAsset,
    ),
  };
}
