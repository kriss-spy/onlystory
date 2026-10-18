import type { Episode, GameId } from './model';

// BA's group stories are club stories, distinct from branches inside an event.
export const baStoryCategories = [
  'Main story',
  'Group story',
  'Mini story',
  'Relationship story',
  'Event',
] as const;
export function storyCategories(
  game: GameId | undefined,
): readonly Episode['category'][] {
  return game === 'ba' ? baStoryCategories : ['Main story', 'Event'];
}
