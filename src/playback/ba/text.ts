import type { Episode, StoryNode } from '../../model';

export function decodeBaChapter(input: unknown, episode: Episode): Episode {
  const value = input as {
    version?: number;
    format?: string;
    id?: string;
    entryNodeId?: string;
    nodes?: StoryNode[];
  } | null;
  if (
    !value ||
    value.version !== 1 ||
    value.format !== 'ba-text-v1' ||
    value.id !== episode.id ||
    value.entryNodeId !== episode.entryNodeId ||
    !Array.isArray(value.nodes) ||
    !value.nodes.length ||
    value.nodes.length !== episode.content?.count
  )
    throw new Error('The BA chapter does not match this library version.');
  const ids = new Set<string>();
  const group = episode.id.replace(/^ba-jp-/, '');
  const localized = (text: unknown) =>
    !!text &&
    typeof text === 'object' &&
    ['en', 'zh-CN', 'ja'].every(
      (k) => typeof (text as Record<string, unknown>)[k] === 'string',
    );
  for (const node of value.nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      ids.has(node.id) ||
      !['text', 'choice', 'video', 'end'].includes(node.kind) ||
      typeof node.speaker !== 'string' ||
      !localized(node.text) ||
      !node.scene ||
      node.scene.background !== 'platform' ||
      !Array.isArray(node.scene.actors) ||
      node.scene.actors.length ||
      (node.kind === 'video'
        ? !node.video ||
          !/^\/private\/ba-jp\/(?:\d+|shared)\/media\/videos?\/[A-Za-z0-9_-]+\.mp4$/.test(
            node.video,
          )
        : node.video) ||
      (node.voice &&
        (!episode.content?.sceneUrl ||
          !/^\/private\/ba-jp\/(?:\d+|shared)\/media\/voice\/[A-Za-z0-9_-]+\.(?:ogg|mp3|wav)$/.test(
            node.voice,
          ))) ||
      node.bgm ||
      node.female ||
      node.speakerLocales ||
      (node.playerName &&
        (node.playerName.token !== '[USERNAME]' ||
          node.playerName.fallback !== 'プレイヤー')) ||
      (node.kind === 'end'
        ? node.id !== `${group}:end` || node.next !== undefined
        : !node.source ||
          node.source.script !== group ||
          !Number.isInteger(node.source.row) ||
          node.source.row < 0 ||
          node.id !== `${group}:${node.source.row}` ||
          node.source.contentId !== Number(group))
    )
      throw new Error('The BA chapter contains an invalid passage.');
    ids.add(node.id);
  }
  if (value.nodes[0].id !== episode.entryNodeId)
    throw new Error('The BA chapter entry has changed.');
  for (const node of value.nodes) {
    if (
      (node.kind === 'text' || node.kind === 'video') &&
      (typeof node.next !== 'string' || !ids.has(node.next))
    )
      throw new Error('Invalid BA passage target.');
    if (
      node.kind === 'choice' &&
      (!Array.isArray(node.choices) ||
        node.choices.length < 1 ||
        new Set(node.choices.map((c) => c.id)).size !== node.choices.length ||
        node.choices.some(
          (c) =>
            !c ||
            typeof c.id !== 'string' ||
            !localized(c.label) ||
            !ids.has(c.next),
        ))
    )
      throw new Error('Invalid BA choice targets.');
  }
  const reachable = new Set<string>();
  const byId = new Map(value.nodes.map((n) => [n.id, n]));
  const visit = (id: string, active: Set<string>) => {
    if (active.has(id))
      throw new Error('The BA chapter contains a control-flow cycle.');
    if (reachable.has(id)) return;
    reachable.add(id);
    const node = byId.get(id)!;
    const next = new Set(active).add(id);
    for (const target of node.kind === 'choice'
      ? node.choices!.map((c) => c.next)
      : node.next
        ? [node.next]
        : [])
      visit(target, next);
  };
  visit(value.nodes[0].id, new Set());
  if (
    reachable.size !== value.nodes.length ||
    value.nodes.filter((n) => n.kind === 'end').length !== 1
  )
    throw new Error('The BA chapter contains unreachable passages.');
  return {
    ...episode,
    nodes: value.nodes,
    readingMode: episode.content?.sceneUrl ? undefined : 'text',
    renderer: {
      id: episode.content?.sceneUrl ? 'ba-scene' : 'text-only',
      payload: null,
    },
  };
}
