import type { BaAssets } from './types';

/** Successive ground impacts sweep from the right edge to the left in source time. */
export function underFire(
  host: HTMLElement,
  assets: BaAssets,
  image: (url: string) => HTMLImageElement,
  reduced: boolean,
) {
  host.dataset.atmosphere = 'BG_UnderFire';
  const smoke = assets.effects.FX_TEX_Smoke_17;
  if (
    !smoke ||
    !assets.effects.BA_UnderFire_HardRain ||
    [1, 2, 3].some((i) => !assets.effects[`BA_UnderFire_Fire${i}`])
  )
    throw new Error(
      'Original UnderFire smoke is missing. Reacquire BA assets.',
    );
  const smokeUrl = image(smoke).src;
  for (let i = 0; i < (reduced ? 3 : 10); i++) {
    const x = reduced ? 80 - i * 30 : 92 - i * 10;
    const fire = image(assets.effects[`BA_UnderFire_Fire${(i % 3) + 1}`]);
    fire.className = 'ba-impact';
    fire.style.left = `${x}%`;
    host.append(fire);
    if (!reduced)
      fire.animate(
        [
          { opacity: 0, transform: 'translateX(-50%) scale(.4,.2)' },
          {
            opacity: 1,
            transform: 'translateX(-50%) scale(1,1)',
            offset: 0.18,
          },
          {
            opacity: 1,
            transform: 'translateX(-50%) scale(1,1)',
            offset: 0.65,
          },
          { opacity: 0, transform: 'translateX(-50%) scale(.8,.3)' },
        ],
        { duration: 320, delay: i * 100, fill: 'both' },
      );
    for (let j = 0; j < 2; j++) {
      const puff = document.createElement('div');
      puff.className = 'ba-impact-smoke';
      puff.style.left = `${x + j * 7}%`;
      puff.style.backgroundImage = `url("${smokeUrl}")`;
      host.append(puff);
      if (!reduced) {
        puff.animate(
          Array.from({ length: 9 }, (_, frame) => ({
            backgroundPosition: `${(frame % 3) * 50}% ${Math.floor(frame / 3) * 50}%`,
          })),
          {
            duration: 530,
            delay: i * 100 + j * 35,
            easing: 'steps(1,end)',
            fill: 'both',
          },
        );
        puff.animate(
          [
            { opacity: 0, transform: 'translate(-50%,5%) scale(.45)' },
            { opacity: 0.95, offset: 0.2 },
            { opacity: 0, transform: 'translate(-40%,-35%) scale(1.2)' },
          ],
          { duration: 530, delay: i * 100 + j * 35, fill: 'both' },
        );
      } else {
        puff.style.backgroundPosition = '50% 50%';
        puff.style.opacity = '.45';
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const streak = image(assets.effects.BA_UnderFire_HardRain);
    streak.className = 'ba-fireline';
    streak.style.left = `${90 - i * 29}%`;
    streak.style.bottom = '3%';
    host.append(streak);
    if (!reduced)
      streak.animate(
        [
          { opacity: 0, transform: 'translateY(-80%) rotate(12deg)' },
          { opacity: 0.9, offset: 0.35 },
          { opacity: 0, transform: 'translateY(0) rotate(12deg)' },
        ],
        { duration: 260, delay: i * 300, fill: 'both' },
      );
  }
}
