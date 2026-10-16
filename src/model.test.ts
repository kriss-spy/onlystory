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
} from './model';

const episode = episodes[0];
const decision = () => advance(episode, advance(episode, startSave(episode)));

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
