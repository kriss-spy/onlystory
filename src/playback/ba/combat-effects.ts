import type { BaAssets, BaState } from './types';
import type { FaceBounds } from './emotion-layout';

type Piece = {
  texture: string;
  color: string;
  duration: number;
  rotation: number;
  width: number;
  height: number;
};
/** Native emitter lifetimes and art; mesh distortion is approximated in 2D. */
export function combatPieces(name: string): Piece[] {
  if (name === 'Shot_Center')
    return [
      {
        texture: 'FX_TEX_Hit_01',
        color: '#facb6b',
        duration: 150,
        rotation: 0,
        width: 100,
        height: 100,
      },
    ];
  if (name === 'nkultra')
    return [
      {
        texture: 'FX_TEX_Noise_15',
        color: '#ea0000',
        duration: 850,
        rotation: 0,
        width: 100,
        height: 35,
      },
      ...[-12, 12, -28, 28].map((rotation, i) => ({
        texture: 'FX_TEX_Flare_03',
        color: i % 2 ? '#ff0000' : '#ffd1d1',
        duration: i < 2 ? 450 : 400,
        rotation,
        width: 100,
        height: 20,
      })),
    ];
  if (name === 'nkultrabreak')
    return [
      {
        texture: 'FX_TEX_Lightning_RGB_02a',
        color: '#ff6160',
        duration: 300,
        rotation: 0,
        width: 100,
        height: 100,
      },
      {
        texture: 'FX_TEX_Circle_01',
        color: '#ff6462',
        duration: 300,
        rotation: 0,
        width: 85,
        height: 85,
      },
      {
        texture: 'FX_TEX_Stretch_Scroll_06',
        color: '#ffb1c4',
        duration: 600,
        rotation: 0,
        width: 100,
        height: 100,
      },
    ];
  return [];
}

export function combatEffects(
  layer: HTMLElement,
  state: BaState,
  assets: BaAssets,
  image: (path: string) => string,
  instant: boolean,
): Animation[] {
  layer.replaceChildren();
  if (instant) return [];
  const animations: Animation[] = [];
  const effects = [
    ...Object.values(state.actors)
      .filter((a) => a.visible && /^nkultra(?:break)?$/.test(a.fx))
      .map((a) => ({
        name: a.fx,
        character: a.name,
        left:
          50 +
          ([-0.5, -7 / 24, -1 / 6, 0, 1 / 6, 7 / 24][a.position] ?? 0) * 100,
        top: 35,
      })),
    ...(state.globalFx ?? [])
      .filter((fx) => fx.name === 'Shot_Center')
      .map((fx) => ({
        ...fx,
        character: '',
        left: 50 + fx.x / 30,
        top: 50 - fx.y / 16.875,
      })),
  ];
  for (const effect of effects) {
    const container = document.createElement('span');
    container.className = 'ba-combat-effect';
    container.dataset.character = effect.character;
    container.dataset.effect = effect.name;
    container.style.left = `${effect.left}%`;
    container.style.top = `${effect.top}%`;
    layer.append(container);
    for (const piece of combatPieces(effect.name)) {
      const path = assets.effects[piece.texture];
      if (!path)
        throw new Error(
          `Original combat texture unavailable: ${piece.texture}`,
        );
      const element = document.createElement('span');
      element.style.maskImage = `url("${image(path)}")`;
      element.style.backgroundColor = piece.color;
      element.style.width = `${piece.width}%`;
      element.style.height = `${piece.height}%`;
      container.append(element);
      const rotate = `translate(-50%, -50%) rotate(${piece.rotation}deg)`;
      animations.push(
        element.animate(
          [
            { opacity: 0, transform: `${rotate} scale(.35)` },
            { opacity: 1, transform: `${rotate} scale(.8)`, offset: 0.12 },
            { opacity: 0.8, transform: `${rotate} scale(1.05)`, offset: 0.55 },
            { opacity: 0, transform: `${rotate} scale(1.25)` },
          ],
          { duration: piece.duration, fill: 'both' },
        ),
      );
    }
  }
  return animations;
}

export function positionCombatEffect(
  layer: HTMLElement,
  character: string,
  face: FaceBounds,
) {
  for (const element of layer.querySelectorAll<HTMLElement>(
    '.ba-combat-effect',
  )) {
    if (element.dataset.character !== character) continue;
    element.style.left = `${(face.left + face.right) / 2}px`;
    element.style.top = `${(face.top + face.bottom) / 2}px`;
    element.style.width = `${Math.max(60, (face.right - face.left) * 2)}px`;
    element.style.height = `${Math.max(60, (face.bottom - face.top) * 1.8)}px`;
  }
}
