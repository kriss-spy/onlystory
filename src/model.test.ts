import { describe, expect, it } from 'vitest';
import { episodes } from './fixtures';
import {
  advance,
  canFastForward,
  emptyData,
  mergeData,
  nodeOf,
  parseData,
  passageUrl,
  restorePassage,
  resumeSave,
  rewind,
  readingPath,
  startSave,
  type Episode,
  type StoryNode,
} from './model';

const episode = episodes[0];
const decision = () => advance(episode, advance(episode, startSave(episode)));

function gfl1Variants(): Episode {
  const source = (
    id: string,
    row: number,
    kind: StoryNode['kind'] = 'text',
  ): StoryNode => ({
    id,
    kind,
    speaker: '',
    text: { en: `Source row ${row}`, 'zh-CN': `Source row ${row}` },
    scene: { background: 'platform', actors: [] },
    ...(kind !== 'end'
      ? { source: { script: 'story', row, contentId: 0, index: row - 1 } }
      : {}),
  });
  return {
    ...episode,
    id: 'gfl1-story',
    game: 'gfl1',
    entryNodeId: 'story:1',
    renderer: { id: 'gfl1', payload: {} },
    nodes: [
      {
        ...source('story:1', 1, 'choice'),
        choices: [
          {
            id: 'left',
            label: { en: 'Left', 'zh-CN': 'Left' },
            next: 'story:2',
          },
          {
            id: 'right',
            label: { en: 'Right', 'zh-CN': 'Right' },
            next: 'story:3',
          },
        ],
      },
      { ...source('story:2', 2), next: 'story:4' },
      { ...source('story:3', 3), next: 'story:4:state-1' },
      {
        ...source('story:4', 4, 'choice'),
        choices: [
          {
            id: 'done',
            label: { en: 'Done', 'zh-CN': 'Done' },
            next: 'story:end',
          },
        ],
      },
      {
        ...source('story:4:state-1', 4, 'choice'),
        choices: [
          {
            id: 'done',
            label: { en: 'Done', 'zh-CN': 'Done' },
            next: 'story:end:state-1',
          },
        ],
      },
      source('story:end', 5, 'end'),
      source('story:end:state-1', 5, 'end'),
    ],
  };
}

describe('GFL1 source aliases', () => {
  it('restores canonical source rows and end cards on the selected variant while exact clone links remain exact', () => {
    const current = gfl1Variants();
    expect(
      restorePassage(current, 'story:4', '{"story:1":"right"}').frames.at(-1)
        ?.node,
    ).toBe('story:4:state-1');
    expect(
      restorePassage(
        current,
        'story:end',
        '{"story:1":"right","story:4":"done"}',
      ).frames.at(-1)?.node,
    ).toBe('story:end:state-1');
    expect(
      restorePassage(
        current,
        'story:4:state-1',
        '{"story:1":"right"}',
      ).frames.at(-1)?.node,
    ).toBe('story:4:state-1');
    expect(() =>
      restorePassage(current, 'story:4:state-1', '{"story:1":"left"}'),
    ).toThrow('unavailable');
    expect(() =>
      restorePassage(current, 'story:2', '{"story:1":"right"}'),
    ).toThrow('unavailable');
    expect(() =>
      restorePassage(
        { ...current, game: 'gfl2' },
        'story:4',
        '{"story:1":"right"}',
      ),
    ).toThrow('unavailable');
  });

  it('replays old canonical save frames and choice keys into reached variants without skipping rows', () => {
    const current = gfl1Variants();
    let old = startSave(current);
    old = {
      ...old,
      frames: [
        { node: 'story:1', answers: {} },
        { node: 'story:3', answers: { 'story:1': 'right' } },
        { node: 'story:4', answers: { 'story:1': 'right' } },
        {
          node: 'story:end',
          answers: { 'story:1': 'right', 'story:4': 'done' },
        },
      ],
      seen: ['story:1', 'story:3', 'story:4'],
      videoTime: 1.5,
    };
    const migrated = resumeSave(current, old);
    expect(migrated.frames.map((frame) => frame.node)).toEqual([
      'story:1',
      'story:3',
      'story:4:state-1',
      'story:end:state-1',
    ]);
    expect(migrated.frames.at(-1)?.answers).toEqual({
      'story:1': 'right',
      'story:4:state-1': 'done',
    });
    expect(migrated.seen).toContain('story:4:state-1');
    expect(migrated.completed).toBe(true);
    expect(migrated.videoTime).toBe(1.5);
    expect(old.frames.at(-1)?.node).toBe('story:end');
    expect(resumeSave(current, migrated).frames).toEqual(migrated.frames);
    const url = new URL(passageUrl(current, migrated), 'http://localhost');
    expect(
      restorePassage(
        current,
        url.searchParams.get('line')!,
        url.searchParams.get('choices'),
      ).frames,
    ).toEqual(migrated.frames);
    expect(() =>
      resumeSave(current, {
        ...old,
        frames: old.frames.filter((_, index) => index !== 1),
      }),
    ).toThrow('no longer matches');
    expect(() =>
      resumeSave(current, {
        ...old,
        frames: old.frames.map((frame, index) =>
          index === 1 ? { ...frame, node: 'story:2' } : frame,
        ),
      }),
    ).toThrow('no longer matches');
    expect(() =>
      resumeSave(current, {
        ...old,
        frames: old.frames.map((frame) => ({
          ...frame,
          answers: { ...frame.answers, unvisited: 'done' },
        })),
      }),
    ).toThrow('no longer matches');
  });

  it('round-trips wrong, wrong, correct quiz visits in copied links and saved progress', () => {
    const current = gfl1Variants();
    current.entryNodeId = 'story:4';
    current.nodes = [
      {
        ...current.nodes[3],
        choices: [
          {
            id: 'wrong',
            label: { en: 'Wrong', 'zh-CN': 'Wrong' },
            next: 'story:5',
          },
          {
            id: 'correct',
            label: { en: 'Correct', 'zh-CN': 'Correct' },
            next: 'story:end',
          },
        ],
      },
      {
        ...current.nodes[1],
        id: 'story:5',
        source: { script: 'story', row: 5, contentId: 0, index: 4 },
        next: 'story:4:retry',
      },
      {
        ...current.nodes[3],
        id: 'story:4:retry',
        choices: [
          {
            id: 'wrong',
            label: { en: 'Wrong', 'zh-CN': 'Wrong' },
            next: 'story:5:state-1',
          },
          {
            id: 'correct',
            label: { en: 'Correct', 'zh-CN': 'Correct' },
            next: 'story:end:state-1',
          },
        ],
      },
      {
        ...current.nodes[1],
        id: 'story:5:state-1',
        source: { script: 'story', row: 5, contentId: 0, index: 4 },
        next: 'story:4:retry',
      },
      current.nodes[5],
      current.nodes[6],
    ];
    let save = startSave(current);
    save = advance(current, advance(current, save, 'wrong'));
    save = advance(current, advance(current, save, 'wrong'));
    save = advance(current, save, 'correct');
    const url = new URL(passageUrl(current, save), 'http://localhost');
    expect(JSON.parse(url.searchParams.get('choices')!)).toEqual({
      'story:4': ['wrong'],
      'story:4:retry': ['wrong', 'correct'],
    });
    expect(
      restorePassage(current, 'story:end', url.searchParams.get('choices'))
        .frames,
    ).toEqual(save.frames);
    expect(
      restorePassage(
        current,
        'story:end:state-1',
        url.searchParams.get('choices'),
      ).frames,
    ).toEqual(save.frames);
    expect(
      restorePassage(
        current,
        'story:end',
        '{"story:4":["wrong","wrong","correct"]}',
      ).frames,
    ).toEqual(save.frames);
    expect(resumeSave(current, save).frames).toEqual(save.frames);
    const legacy = {
      ...save,
      frames: save.frames.map((frame) => ({
        ...frame,
        node: frame.node.replace(/:retry|:state-1/g, ''),
        answers: Object.fromEntries(
          Object.entries(frame.answers).map(([key, answer]) => [
            key.replace(/:retry|:state-1/g, ''),
            answer,
          ]),
        ),
      })),
    };
    expect(resumeSave(current, legacy).frames).toEqual(save.frames);
    expect(() =>
      restorePassage(current, 'story:end', '{"story:4":["wrong","wrong"]}'),
    ).toThrow('unavailable');
  });
});

describe('branch-aware reading', () => {
  it('resumes a repeated choice using the saved answers at each visit', () => {
    const looping = structuredClone(episode);
    looping.nodes.find((n) => n.id === 'follow')!.next = 'decision';
    let save = advance(looping, advance(looping, startSave(looping)));
    save = advance(looping, save, 'follow');
    save = advance(looping, save);
    save = advance(looping, save, 'listen');
    expect(resumeSave(looping, save).frames).toEqual(save.frames);
    expect(save.frames.filter((f) => f.node === 'decision')).toHaveLength(2);
    const url = new URL(passageUrl(looping, save), 'http://localhost');
    expect(
      restorePassage(
        looping,
        url.searchParams.get('line')!,
        url.searchParams.get('choices'),
      ).frames,
    ).toEqual(save.frames);
  });
  it('rewinds the active path before taking another branch, while retaining read history', () => {
    const followed = advance(episode, advance(episode, decision(), 'follow'));
    const beforeChoice = rewind(followed, 2);
    const listened = advance(episode, beforeChoice, 'listen');
    expect(listened.frames.map((f) => f.node)).toEqual([
      'arrival',
      'signal',
      'decision',
      'listen',
    ]);
    expect(listened.frames.at(-1)?.answers).toEqual({ decision: 'listen' });
    expect(listened.seen).toContain('follow');
    expect(followed.frames.at(-1)?.answers).toEqual({ decision: 'follow' });
  });
  it('restores the same branch in another tab from its URL', () => {
    const saved = advance(episode, advance(episode, decision(), 'follow'));
    const url = new URL(passageUrl(episode, saved), 'http://localhost');
    const restored = restorePassage(
      episode,
      url.searchParams.get('line')!,
      url.searchParams.get('choices'),
    );
    expect(restored.frames).toEqual(saved.frames);
    expect(() =>
      restorePassage(episode, 'follow', '{"decision":"listen"}'),
    ).toThrow('unavailable');
    expect(() => restorePassage(episode, 'follow', '[]')).toThrow('invalid');
  });
  it('fast-forwards unread text but requires answers and stops at unsupported scenes', () => {
    const save = decision();
    expect(advance(episode, save)).toBe(save);
    expect(canFastForward(nodeOf(episode, save))).toBe(false);
    const gapEpisode = episodes.find((e) => e.id === 'gfl1-3')!;
    const gap = restorePassage(gapEpisode, 'gap', '{"decision":"listen"}');
    expect(advance(gapEpisode, gap)).toBe(gap);
    expect(canFastForward(nodeOf(gapEpisode, gap))).toBe(false);
    const start = startSave(episode);
    expect(canFastForward(nodeOf(episode, start))).toBe(true);
  });
  it('offers only reachable seek positions without answering choices or crossing archive gaps', () => {
    expect(readingPath(episode, {}).map((frame) => frame.node)).toEqual([
      'arrival',
      'signal',
      'decision',
    ]);
    const path = readingPath(episode, { decision: 'follow' });
    expect(path.map((frame) => frame.node)).toContain('follow');
    expect(path.map((frame) => frame.node)).not.toContain('listen');
    for (const frame of path) {
      expect(
        restorePassage(
          episode,
          frame.node,
          JSON.stringify(frame.answers),
        ).frames.at(-1),
      ).toEqual(frame);
    }
    expect(path[1].answers).toEqual({});
    const gapEpisode = episodes.find((e) => e.id === 'gfl1-3')!;
    expect(readingPath(gapEpisode, { decision: 'listen' }).at(-1)?.node).toBe(
      'gap',
    );
  });
  it('keeps changed or missing saved paths out of the reader', () => {
    const save = decision();
    expect(resumeSave(episode, save).frames).toEqual(save.frames);
    expect(() =>
      resumeSave(episode, {
        ...save,
        frames: [{ node: 'removed', answers: {} }],
      }),
    ).toThrow('unavailable');
    expect(() =>
      resumeSave(episode, { ...save, frames: [save.frames.at(-1)!] }),
    ).toThrow('no longer matches');
  });
});

describe('portable progress', () => {
  it('preserves voice language and migrates old sample voice preferences', () => {
    const load = (preferences: object) =>
      parseData({ version: 1, preferences }).preferences;
    expect(load({ voice: 'ja' }).voice).toBe('ja');
    expect(load({ voice: 'en' }).voice).toBe('zh-CN');
    expect(load({ voice: 'off', voiceVolume: 0.8 })).toMatchObject({
      voice: 'zh-CN',
      voiceVolume: 0,
    });
  });
  it('rejects unknown formats and bounds imported preferences', () => {
    expect(() => parseData({ version: 2 })).toThrow('supported');
    const parsed = parseData({
      version: 1,
      preferences: { theme: 'nonsense', fontSize: 900, musicVolume: -5 },
      saves: { broken: { frames: [] } },
    });
    expect(parsed.preferences).toMatchObject({
      theme: 'system',
      fontSize: 32,
      musicVolume: 0,
    });
    expect(parsed.saves).toEqual({});
  });
  it('merges bookmarks and newer progress without importing device installation claims', () => {
    const current = emptyData();
    const imported = emptyData();
    current.saves[episode.id] = {
      ...decision(),
      updatedAt: '2026-10-15T12:00:00Z',
    };
    imported.saves[episode.id] = {
      ...startSave(episode),
      updatedAt: '2026-10-14T12:00:00Z',
    };
    imported.preferences.theme = 'dark';
    imported.installed['gfl2-2'] = true;
    current.installed[episode.id] = false;
    imported.bookmarks = [
      {
        id: 'point',
        episodeId: episode.id,
        label: 'A branch',
        snapshot: decision(),
        createdAt: '2026-10-15T12:00:00Z',
      },
    ];
    const merged = mergeData(
      current,
      parseData(JSON.parse(JSON.stringify(imported))),
    );
    expect(merged.saves[episode.id].frames).toHaveLength(3);
    expect(merged.bookmarks).toHaveLength(1);
    expect(merged.preferences.theme).toBe('dark');
    expect(merged.installed).toEqual({ [episode.id]: false });
    expect(mergeData(merged, imported).bookmarks).toHaveLength(1);
  });
});
