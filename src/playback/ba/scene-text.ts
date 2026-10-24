import { playerNameText } from '../../model';
import type { Preferences } from '../../model';
import type { BaState } from './types';

// Substitute after parsing source markup so names remain literal text.
export function baSceneText(state: BaState, preferences: Preferences): BaState {
  const format = (text: string) =>
    playerNameText(text, preferences, {
      token: '[USERNAME]',
      fallback: 'プレイヤー',
      fallbackLocales: {
        ja: 'プレイヤー',
        en: 'Sensei',
        'zh-CN': 'プレイヤー',
      },
    });
  return {
    ...state,
    captions: state.captions.map((caption) => ({
      ...caption,
      text: format(caption.text),
      pauses: caption.pauses?.map((pause) => ({
        ...pause,
        offset: Array.from(
          format(Array.from(caption.text).slice(0, pause.offset).join('')),
        ).length,
      })),
    })),
    place: format(state.place),
    title: format(state.title),
  };
}
