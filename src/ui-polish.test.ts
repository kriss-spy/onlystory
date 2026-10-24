import { describe, expect, it } from 'vitest';
import { episodes } from './fixtures';
import {
  advance,
  emptyData,
  gamePreferences,
  mergeData,
  parseData,
  readingTimeline,
  rewind,
  startSave,
} from './model';
import { matchesSearch } from './search';

describe('branch-aware timeline', () => {
  const episode = episodes.find((episode) => episode.id === 'ba-1')!;
  it('shows a locked continuation and never offers an unanswered branch', () => {
    const timeline = readingTimeline(episode, startSave(episode));
    expect(timeline.locked).toBe(true);
    expect(timeline.total).toBeGreaterThan(timeline.frames.length);
    expect(timeline.frames.at(-1)?.node).toBe('decision');
    expect(timeline.choices).toEqual([2]);
    expect(timeline.upcoming.map((item) => item.node)).toEqual(
      expect.arrayContaining(['follow', 'listen', 'system', 'recording']),
    );
    expect(
      timeline.upcoming.every(
        (item) =>
          item.position >= timeline.frames.length &&
          item.position < timeline.total,
      ),
    ).toBe(true);
  });
  it('retains the chosen route when seeking back and preserves the choice position', () => {
    let save = advance(episode, advance(episode, startSave(episode)));
    save = advance(episode, save, 'follow');
    const remembered = save.frames;
    const before = readingTimeline(episode, save);
    const after = readingTimeline(episode, rewind(save, 0), remembered);
    expect(after.frames).toEqual(before.frames);
    expect(after.frames.some((frame) => frame.node === 'listen')).toBe(false);
    expect(after.choices).toEqual(before.choices);
    expect(after.upcoming).toEqual([]);
  });
  it('previews later choice points before answering and updates for the selected branch', () => {
    const branching = structuredClone(episode);
    const later = branching.nodes.find((node) => node.id === 'system')!;
    later.kind = 'choice';
    later.choices = [{ id: 'continue', label: later.text, next: later.next! }];
    delete later.next;
    branching.nodes.find((node) => node.id === 'listen')!.next = 'morning';
    const initial = readingTimeline(branching, startSave(branching));
    expect(initial.choices).toEqual([2, 4]);
    expect(initial.frames.at(-1)?.node).toBe('decision');
    expect(initial.choices[1]).toBeGreaterThan(initial.frames.length - 1);
    expect(initial.upcoming.some((item) => item.node === 'listen')).toBe(true);
    expect(initial.upcoming.some((item) => item.node === 'system')).toBe(true);
    const atChoice = advance(
      branching,
      advance(branching, startSave(branching)),
    );
    expect(
      readingTimeline(branching, advance(branching, atChoice, 'follow'))
        .choices,
    ).toEqual([2, 4]);
    expect(
      readingTimeline(branching, advance(branching, atChoice, 'listen'))
        .choices,
    ).toEqual([2]);
  });
  it('keeps repeated visits and bounds cyclic continuation estimates', () => {
    const looping = structuredClone(episode);
    looping.nodes.find((node) => node.id === 'follow')!.next = 'decision';
    let save = advance(looping, advance(looping, startSave(looping)));
    save = advance(looping, advance(looping, save, 'follow'));
    const timeline = readingTimeline(looping, save);
    expect(timeline.frames.slice(0, save.frames.length)).toEqual(save.frames);
    expect(
      timeline.frames.filter((frame) => frame.node === 'decision'),
    ).toHaveLength(2);
    expect(timeline.total).toBeLessThan(100);
    expect(timeline.frames.at(-1)?.node).toBe('decision');
    expect(timeline.locked).toBe(true);
    expect(
      timeline.upcoming.some((item) =>
        timeline.frames.some((frame) => frame.node === item.node),
      ),
    ).toBe(false);
  });
});

it('inherits old defaults, isolates game preferences and validates backup values', () => {
  const old = parseData({
    version: 1,
    preferences: { playerName: 'Old name', voiceVolume: 0.4 },
  });
  expect(gamePreferences(old.preferences, 'ba').playerName).toBe('Old name');
  old.preferences.games = { ba: { playerName: 'Sensei', voiceVolume: 0.8 } };
  old.preferences.gameThemes = { ba: 'ba' };
  old.preferences.catalogLayout = 'grid';
  const restored = parseData(JSON.parse(JSON.stringify(old)));
  expect(gamePreferences(restored.preferences, 'ba').playerName).toBe('Sensei');
  expect(gamePreferences(restored.preferences, 'gfl2').voiceVolume).toBe(0.4);
  expect(restored.preferences.catalogLayout).toBe('grid');
  expect(restored.preferences.gameThemes?.ba).toBe('ba');
  const mergedOld = mergeData(
    restored,
    parseData({ version: 1, preferences: { theme: 'light' } }),
  );
  expect(mergedOld.preferences.games?.ba?.playerName).toBe('Sensei');
  expect(mergedOld.preferences.catalogLayout).toBe('grid');
  const invalid = parseData({
    ...emptyData(),
    preferences: {
      games: {
        ba: { voiceVolume: 50, playerName: 'x'.repeat(80), games: { ba: {} } },
      },
      gameThemes: { ba: 'arbitrary' },
    },
  });
  expect(invalid.preferences.games?.ba?.voiceVolume).toBe(1);
  expect(invalid.preferences.games?.ba?.playerName).toHaveLength(40);
  expect(invalid.preferences.gameThemes?.ba).toBeUndefined();
});

it('defaults BA dialogue to transparent and preserves explicit per-game opacity and appearance', () => {
  const data = emptyData();
  data.preferences.gameThemes = { ba: 'ba' };
  expect(gamePreferences(data.preferences, 'ba').dialogueOpacity).toBe(0);
  expect(gamePreferences(data.preferences, 'gfl2').dialogueOpacity).toBe(1);
  data.preferences.games = { ba: { dialogueOpacity: 0.6, theme: 'dark' } };
  const restored = parseData(JSON.parse(JSON.stringify(data)));
  expect(gamePreferences(restored.preferences, 'ba').dialogueOpacity).toBe(0.6);
  expect(gamePreferences(restored.preferences, 'ba').theme).toBe('dark');
  expect(gamePreferences(restored.preferences, 'gfl2').theme).toBe('system');
  const invalid = parseData({
    version: 1,
    preferences: {
      games: {
        ba: { dialogueOpacity: 4 },
        gfl2: { dialogueOpacity: -1 },
      },
    },
  });
  expect(gamePreferences(invalid.preferences, 'ba').dialogueOpacity).toBe(1);
  expect(gamePreferences(invalid.preferences, 'gfl2').dialogueOpacity).toBe(0);
});

it('searches supplied localized aliases with Unicode and spacing normalization', () => {
  expect(
    matchesSearch(' ＳＵＭＭＥＲ  cafe ', ['夏の物語', 'Summer Café']),
  ).toBe(true);
  expect(matchesSearch('unrelated', ['夏の物語', 'Summer Café'])).toBe(false);
  expect(matchesSearch('ヒナ', ['ビナー'])).toBe(false);
});
