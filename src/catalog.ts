import type { Episode, GameId, TitleLocales } from './model';
import { matchesSearch } from './search';
import { titleSearchValues } from './localized-titles';
import baMainReleases from './ba-main-releases.json';

const baReleaseDates: Record<string, { date: string; source: string }> =
  baMainReleases;

export interface StoryBranch {
  id: string;
  title?: string;
  after?: string;
  stories: Episode[];
}
export interface StoryEvent {
  id: string;
  game: GameId;
  title: string;
  titleLocales?: TitleLocales;
  category: Episode['category'];
  eventType?: Episode['eventType'];
  notice?: string;
  date: string;
  stories: Episode[];
  main: Episode[];
  branches: StoryBranch[];
}
export interface StoryRow {
  episode: Episode;
  branch?: StoryBranch;
  branchStart?: boolean;
  branchEnd?: boolean;
}

export const eventIdFor = (episode: Episode) =>
  episode.collectionId ?? episode.story;
export const eventUrl = (event: Pick<StoryEvent, 'game' | 'id'>) =>
  `/games/${event.game}/events/${encodeURIComponent(event.id)}`;

// Missing dates are unknown, rather than older than every dated release.
// Keep them after dated collections in either direction, in source order.
export function compareReleaseDates(
  a: Pick<StoryEvent, 'date'>,
  b: Pick<StoryEvent, 'date'>,
  newest: boolean,
) {
  if (!a.date || !b.date) return Number(!a.date) - Number(!b.date);
  return a.date.localeCompare(b.date) * (newest ? -1 : 1);
}

export function groupStoryEvents(episodes: Episode[]): StoryEvent[] {
  const groups = new Map<string, Episode[]>();
  for (const episode of episodes) {
    const key = `${episode.game}:${eventIdFor(episode)}`;
    const group = groups.get(key) ?? [];
    group.push(episode);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const stories = [...group].sort((a, b) => a.order - b.order);
    const main = stories.filter((story) => !story.placement);
    const mainIds = new Set(main.map((story) => story.id));
    const branches = new Map<string, StoryBranch>();
    for (const story of stories) {
      const placement = story.placement;
      if (!placement) continue;
      const after =
        placement.after && mainIds.has(placement.after)
          ? placement.after
          : undefined;
      // An unavailable anchor cannot hide a story or imply a false timeline.
      const key = JSON.stringify([placement.branch, after]);
      const branch = branches.get(key) ?? {
        id: key,
        title: placement.title,
        after,
        stories: [],
      };
      branch.stories.push(story);
      branches.set(key, branch);
    }
    const first = main[0] ?? stories[0];
    return {
      id: eventIdFor(first),
      game: first.game,
      title: first.story,
      titleLocales: first.collectionLocales,
      category: first.category,
      eventType: first.eventType,
      notice: first.collectionNotice,
      // ExposedTime is a scheduling gate, not historical release metadata.
      // Use the chapter's first JP release even when later episodes arrived later.
      date:
        (first.game === 'ba' && baReleaseDates[eventIdFor(first)]?.date) ||
        stories.reduce(
          (date, story) => (story.date > date ? story.date : date),
          '',
        ),
      stories,
      main,
      branches: [...branches.values()],
    };
  });
}

export function storyRows(event: StoryEvent, query = '') {
  const matches = (story: Episode) =>
    matchesSearch(query, [...titleSearchValues(story), story.description]);
  const branchRows = (branch: StoryBranch, all: boolean): StoryRow[] => {
    const stories = branch.stories.filter((story) => all || matches(story));
    return stories.map((episode, index) => ({
      episode,
      branch,
      branchStart: index === 0,
      branchEnd: index === stories.length - 1,
    }));
  };
  const main: StoryRow[] = [];
  for (const episode of event.main) {
    const branches = event.branches.filter(
      (branch) => branch.after === episode.id,
    );
    const sides = branches.flatMap((branch) =>
      branchRows(branch, matches(episode)),
    );
    // Keep the anchor visible when only a side story matches the search.
    if (matches(episode) || sides.length) main.push({ episode }, ...sides);
  }
  const independent = event.branches
    .filter((branch) => !branch.after)
    .flatMap((branch) => branchRows(branch, false));
  return { main, independent };
}

export function nextStory(event: StoryEvent, episode: Episode) {
  const path = episode.placement
    ? event.branches.find((branch) =>
        branch.stories.some((story) => story.id === episode.id),
      )?.stories
    : event.main;
  const index = path?.findIndex((story) => story.id === episode.id) ?? -1;
  return index < 0 ? undefined : path?.[index + 1];
}

// Chapters organize one event's list; they do not introduce another route.
export function storySections(event: StoryEvent, query = '') {
  const groups = new Map<string, Episode[]>();
  for (const story of event.stories) {
    const key = story.chapter?.id ?? '';
    const group = groups.get(key) ?? [];
    group.push(story);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([id, stories]) => ({
      id,
      chapter: stories[0].chapter,
      stories,
      ...storyRows(
        {
          ...event,
          stories,
          main: event.main.filter((story) => stories.includes(story)),
          branches: event.branches.filter((branch) =>
            branch.stories.some((story) => stories.includes(story)),
          ),
        },
        query,
      ),
    }))
    .sort((a, b) => (a.chapter?.order ?? 0) - (b.chapter?.order ?? 0))
    .filter((section) => section.main.length || section.independent.length);
}
