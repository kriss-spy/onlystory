import names from './background-effects.json';
import type { BaAssets } from './types';

// Browser particle composition uses original art; Unity emitter timing is approximate.
export function eventAtmosphere(
  host: HTMLElement,
  assets: BaAssets,
  image: (url: string) => HTMLImageElement,
  id: number,
  reduced: boolean,
) {
  const name = (names as Record<string, string>)[id];
  if (!name || name === 'BG_Dust_L' || name === 'BG_UnderFire') return false;
  host.dataset.atmosphere = name;
  host.style.background = '';
  if (name === 'BG_FocusLine') {
    const lines = document.createElement('div');
    lines.className = 'ba-focus-lines';
    host.append(lines);
    if (!reduced)
      lines.animate([{ opacity: 0.3 }, { opacity: 0.8 }, { opacity: 0.3 }], {
        duration: 450,
        iterations: Infinity,
      });
    return true;
  }
  const love = name.includes('Love');
  const sand = name.includes('SandStorm');
  const fireworks = name.includes('Fireworks');
  if (!name.includes('BGOff') && !sand)
    host.style.background = love
      ? 'radial-gradient(ellipse, #ffc8e81a, #f590c936)'
      : 'radial-gradient(ellipse, transparent, #ffe59c30)';
  const count = fireworks ? 36 : sand ? 16 : 18;
  for (let i = 0; i < count; i++) {
    const path = sand
      ? assets.effects.FX_TEX_Smoke_RGB_15
      : assets.emotions[love ? 'Emoji_Heart' : 'Emoji_Twinkle'];
    const sprite = image(path);
    sprite.className = sand
      ? 'ba-dust ba-sand'
      : love
        ? 'ba-heart'
        : fireworks
          ? 'ba-firework'
          : 'ba-sparkle';
    sprite.style.left = `${fireworks ? 20 + (i % 3) * 30 : (i * 43) % 100}%`;
    sprite.style.top = `${fireworks ? 25 + (i % 3) * 12 : sand ? 20 + ((i * 13) % 70) : (i * 31) % 95}%`;
    host.append(sprite);
    if (reduced) continue;
    const angle = (i / 12) * Math.PI * 2;
    sprite.animate(
      fireworks
        ? [
            { transform: 'translate(-50%,-50%) scale(.1)', opacity: 0 },
            { opacity: 1, offset: 0.15 },
            {
              transform: `translate(calc(-50% + ${Math.cos(angle) * 18}vw),calc(-50% + ${Math.sin(angle) * 25}vh)) scale(.4)`,
              opacity: 0,
            },
          ]
        : sand
          ? [
              { transform: 'translate(30vw,5vh) scale(.8)', opacity: 0 },
              { opacity: 0.3, offset: 0.35 },
              { transform: 'translate(-40vw,-10vh) scale(1.6)', opacity: 0 },
            ]
          : [
              { transform: 'translateY(8vh) scale(.5)', opacity: 0 },
              { opacity: 0.8, offset: 0.3 },
              {
                transform: `translate(${((i % 3) - 1) * 4}vw,-20vh) scale(1.1) rotate(${i % 2 ? 15 : -15}deg)`,
                opacity: 0,
              },
            ],
      {
        duration: fireworks ? 1800 : sand ? 4500 : 3500,
        delay: -(i * 293),
        iterations: Infinity,
      },
    );
  }
  return true;
}
