import { describe, expect, it } from 'vitest';
import {
  eventUrl,
  groupStoryEvents,
  nextStory,
  storyRows,
  storySections,
} from './catalog';
import { episodes } from './fixtures';
import type { Episode } from './model';

const story = (
  id: string,
  order: number,
  placement?: Episode['placement'],
): Episode => ({
  ...episodes[0],
  id,
  order,
  collectionId: 'event-a',
  story: 'An event',
  placement,
});

describe('event reading structure', () => {
  const mainA = story('main-a', 1);
  const sideA = story('side-a', 2, {
    kind: 'side',
    branch: 'memories',
    after: 'main-a',
  });
  const sideB = story('side-b', 3, {
    kind: 'side',
    branch: 'memories',
    after: 'main-a',
  });
  const mainB = story('main-b', 4);
  const independent = story('independent', 5, {
    kind: 'side',
    branch: 'elsewhere',
  });
  const event = groupStoryEvents([mainB, independent, sideB, mainA, sideA])[0];

  it('groups stories into an event without mutating their source ordering', () => {
    expect(event.main.map((story) => story.id)).toEqual(['main-a', 'main-b']);
    expect(
      event.branches.map((branch) => branch.stories.map((story) => story.id)),
    ).toEqual([['side-a', 'side-b'], ['independent']]);
    expect(eventUrl(event)).toBe('/games/gfl2/events/event-a');
  });
  it('keeps main continuation separate from side-story sequences', () => {
    expect(nextStory(event, mainA)?.id).toBe('main-b');
    expect(nextStory(event, sideA)?.id).toBe('side-b');
    expect(nextStory(event, sideB)).toBeUndefined();
    expect(nextStory(event, mainB)).toBeUndefined();
    expect(nextStory(event, independent)).toBeUndefined();
  });
  it('indents side sequences after their anchor and separates unplaced stories', () => {
    const rows = storyRows(event);
    expect(rows.main.map((row) => [row.episode.id, !!row.branch])).toEqual([
      ['main-a', false],
      ['side-a', true],
      ['side-b', true],
      ['main-b', false],
    ]);
    expect(rows.independent.map((row) => row.episode.id)).toEqual([
      'independent',
    ]);
  });
  it('search retains the main anchor of a matching side story', () => {
    const renamed = groupStoryEvents([
      mainA,
      { ...sideA, title: 'A unique memory' },
      mainB,
    ])[0];
    expect(
      storyRows(renamed, 'unique').main.map((row) => row.episode.id),
    ).toEqual(['main-a', 'side-a']);
  });
  it('keeps a story with a missing anchor accessible outside the timeline', () => {
    const missing = story('orphan', 2, {
      kind: 'side',
      branch: 'missing',
      after: 'not-imported',
    });
    const rows = storyRows(groupStoryEvents([mainA, missing])[0]);
    expect(rows.independent[0].episode.id).toBe('orphan');
  });
  it('keeps same-name events in different games separate', () => {
    expect(
      groupStoryEvents([mainA, { ...mainA, id: 'other-game', game: 'ba' }]),
    ).toHaveLength(2);
  });
  it('keeps chapters inside one event and preserves branches and cross-chapter continuation', () => {
    const upper = { id: 'upper', title: '上篇', order: 1 };
    const lower = { id: 'lower', title: '下篇', order: 2 };
    const a = { ...mainA, chapter: upper };
    const b = { ...mainB, chapter: lower };
    const grouped = groupStoryEvents([b, { ...sideA, chapter: upper }, a]);
    expect(grouped).toHaveLength(1);
    const sections = storySections(grouped[0]);
    expect(sections.map((section) => section.chapter?.title)).toEqual([
      '上篇',
      '下篇',
    ]);
    expect(sections[0].main.map((row) => row.episode.id)).toEqual([
      'main-a',
      'side-a',
    ]);
    expect(nextStory(grouped[0], a)?.id).toBe('main-b');
    expect(storySections(grouped[0], b.title).length).toBeGreaterThan(0);
  });
});
