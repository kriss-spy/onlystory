export interface EmotionPiece {
  sprite: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  angle?: number;
}
export function emotionComposition(sprite: string): {
  layout: string;
  pieces: EmotionPiece[];
} {
  if (sprite === 'Emoji_Aggro' || sprite === 'Emoji_Action')
    return {
      layout: sprite === 'Emoji_Aggro' ? 'angry' : 'respond',
      pieces: Array.from({ length: 3 }, () => ({ sprite })),
    };
  if (sprite === 'Emoji_Exclamation')
    return { layout: '', pieces: [{ sprite }] };
  const at = (
    name: string,
    left: number,
    top: number,
    width: number,
    height: number,
    angle = 0,
  ) => ({ sprite: name, left, top, width, height, angle });
  const composed: Record<string, EmotionPiece[]> = {
    Emoji_Sad: [
      at(sprite, 5, 0, 23, 70),
      at(sprite, 38, 15, 23, 70),
      at(sprite, 70, 3, 23, 70),
    ],
    Emoji_Steam: [
      at(sprite, 2, 15, 55, 70, -25),
      at(sprite, 47, 3, 50, 65, 25),
    ],
    Emoji_Tear_1: [
      at(sprite, 5, 25, 55, 65),
      at('Emoji_Tear_2', 65, 5, 28, 40),
    ],
    Emoji_Sweat_1: [
      at(sprite, 5, 15, 60, 80),
      at('Emoji_Sweat_2', 65, 0, 30, 45),
    ],
    Emoji_Bulb_1: [
      at('Emoji_Balloon_N', 0, 0, 100, 100),
      at(sprite, 32, 28, 36, 55),
      at('Emoji_Bulb_2', 20, 0, 60, 48),
    ],
    Emoji_Zzz: [
      at(sprite, 3, 62, 36, 36, -12),
      at(sprite, 40, 29, 29, 29, 8),
      at(sprite, 72, 0, 22, 22, -5),
    ],
  };
  return composed[sprite]
    ? { layout: 'composed', pieces: composed[sprite] }
    : { layout: '', pieces: [{ sprite }] };
}
export const isDotEmotion = (value: string) =>
  ['[...]', '…', '[…]', '...'].includes(value);
