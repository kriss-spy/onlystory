import sounds from './emotion-sounds.json';
import type { BaState } from './types';

export function baEmotionSounds(state: BaState): string[] {
  return Object.values(state.actors).flatMap((actor) => {
    const sound = sounds[actor.emotion as keyof typeof sounds];
    return actor.visible && sound ? [sound] : [];
  });
}
