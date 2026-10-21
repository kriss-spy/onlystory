import { describe, expect, it } from 'vitest';
import definitions from '../scripts/ba-library.json';
import boundaries from './battle-boundaries.json';
import { battleNotice } from './battle-notices';
import type { Episode, StoryNode } from './model';

describe('omitted battle boundaries', () => {
  it('matches the pinned official front/back mode groups without title inference', () => {
    const modes = new Map<string, { front: number[]; back: number[] }>();
    for (const definition of definitions) {
      if (!('mainStory' in definition) || !definition.mainStory) continue;
      const metadata = definition.mainStory;
      for (const id of metadata.modeIds) {
        const key = `${definition.collectionId}:${id}`;
        const phases = modes.get(key) ?? { front: [], back: [] };
        phases[metadata.phase as 'front' | 'back'].push(definition.group);
        modes.set(key, phases);
      }
    }
    const pairs = [
      ...new Set(
        [...modes.values()]
          .filter(({ front, back }) => front.length && back.length)
          .map(({ front, back }) => `${front.at(-1)}:${back[0]}`),
      ),
    ].sort(
      (a, b) =>
        Number(a.split(':')[0]) - Number(b.split(':')[0]) ||
        Number(a.split(':')[1]) - Number(b.split(':')[1]),
    );
    expect(boundaries).toEqual(
      pairs.map((pair) => {
        const [before, after] = pair.split(':');
        return { before: `ba-jp-${before}`, after: `ba-jp-${after}` };
      }),
    );
  });

  it('marks both front completion and direct back-story entry, not every passage', () => {
    const pair = boundaries[0];
    const first = { id: 'first', kind: 'text' } as StoryNode;
    const middle = { id: 'middle', kind: 'text' } as StoryNode;
    const end = { id: 'end', kind: 'end' } as StoryNode;
    const episode = { id: pair.before, nodes: [first, middle, end] } as Episode;
    expect(battleNotice(episode, end)).toContain('next story');
    expect(battleNotice(episode, first)).toBeNull();
    expect(battleNotice({ ...episode, id: pair.after }, first)).toContain(
      'This story',
    );
    expect(battleNotice({ ...episode, id: pair.after }, middle)).toBeNull();
    expect(
      battleNotice({ ...episode, id: 'battle-title-only' }, end),
    ).toBeNull();
  });
});
