import metadata from './main-background-effects.json';
import native from './main-atmosphere-native.json';
import { eventAtmosphere } from './atmosphere';
import { underFire } from './under-fire';
import type { BaAssets } from './types';

type BackgroundEffect = {
  Name: number;
  Effect: string;
  Effect2: string;
  Scroll: string;
  ScrollTime: number;
  ScrollFrom: number;
  ScrollTo: number;
};
const effects = metadata as Record<string, BackgroundEffect>;
const legacy = new Set([
  'BG_FocusLine',
  'BG_Love_L',
  'BG_Love_L_BGOff',
  'BG_SandStorm_L',
  'BG_Shining_L',
  'BG_Shining_L_BGOff',
  'BG_Fireworks_L_BGOff_01',
  'BG_Fireworks_L_BGOff_02',
]);
const running = new WeakMap<HTMLElement, Animation[]>();
const externalLayers = new WeakMap<HTMLElement, HTMLElement[]>();
const nativeEffects = native.effects as Record<
  string,
  {
    scopes: { AboveBg: number; AboveCharacter: number; AboveAll: number };
  }
>;

export function mainAtmosphereBehindCharacters(name: string) {
  if (name.endsWith('_BG')) return true;
  const scope = nativeEffects[name]?.scopes;
  return !!scope?.AboveBg && !scope.AboveCharacter && !scope.AboveAll;
}

/** Scope and combination come from the official table. Browser shader/emitter
 * composition is an approximation; it does not execute Unity particle shaders. */
export function mainAtmospherePlan(id: number) {
  if (!id)
    return {
      names: [],
      backgroundFilter: '',
      characterFilter: '',
      finite: false,
    };
  const row = effects[id];
  if (!row) return null;
  const names = [row.Effect, row.Effect2].filter(Boolean);
  const backgroundFilters: string[] = [];
  const characterFilters: string[] = [];
  for (const name of names) {
    let filter = '';
    if (/^Shader_Gray/.test(name)) filter = 'grayscale(1)';
    else if (/^Shader_Sepia_brown/.test(name)) filter = 'sepia(1)';
    else if (/^BG_Filter_Flashback/.test(name))
      filter = 'saturate(.55) sepia(.18) contrast(.9) brightness(1.08)';
    else if (/^BG_Filter_Red/.test(name))
      filter = 'sepia(.9) saturate(3) hue-rotate(315deg) brightness(.8)';
    if (filter) {
      backgroundFilters.push(filter);
      if (!name.endsWith('_BG')) characterFilters.push(filter);
    }
  }
  return {
    names,
    backgroundFilter: backgroundFilters.join(' '),
    characterFilter: characterFilters.join(' '),
    finite: names.some((name) =>
      /Flash(?:_Sound)?$|Eye(?:Open|Close)$|TVTurnOff|GrowupLight|WaveShort|UnderFire/.test(
        name,
      ),
    ),
  };
}

export function resetMainAtmosphere(host: HTMLElement) {
  for (const animation of running.get(host) ?? []) animation.cancel();
  running.delete(host);
  for (const element of externalLayers.get(host) ?? []) element.remove();
  externalLayers.delete(host);
  const stage = host.parentElement;
  for (const element of stage?.querySelectorAll<HTMLElement>(
    '.ba-background, .ba-actors, .ba-signal',
  ) ?? [])
    element.style.filter = '';
  delete host.dataset.finite;
  delete host.dataset.composition;
}

export function finishMainAtmosphere(host: HTMLElement) {
  if (host.dataset.finite !== 'true') return;
  for (const animation of host.getAnimations({ subtree: true }))
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime))
      animation.finish();
}

function layer(host: HTMLElement, name: string) {
  const element = document.createElement('div');
  element.className = 'ba-main-atmosphere-layer';
  element.dataset.nativeEffect = name;
  Object.assign(element.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
  });
  host.append(element);
  return element;
}

function animate(
  host: HTMLElement,
  target: HTMLElement,
  frames: Keyframe[],
  timing: KeyframeAnimationOptions,
  reduced: boolean,
) {
  if (reduced) return;
  const animation = target.animate(frames, timing);
  const list = running.get(host) ?? [];
  list.push(animation);
  running.set(host, list);
}

function grain(host: HTMLElement, target: HTMLElement, reduced: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  Object.assign(canvas.style, {
    width: '100%',
    height: '100%',
    opacity: '.22',
    mixBlendMode: 'soft-light',
  });
  const context = canvas.getContext('2d');
  if (context) {
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 103357;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const value = seed & 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 200;
    }
    context.putImageData(pixels, 0, 0);
  }
  target.append(canvas);
  animate(
    host,
    canvas,
    [
      { transform: 'scale(1.1) translate(-2%,-2%)', opacity: 0.18 },
      { transform: 'scale(1.1) translate(2%,2%)', opacity: 0.3 },
    ],
    { duration: 160, iterations: Infinity, easing: 'steps(2,end)' },
    reduced,
  );
}

function particles(
  host: HTMLElement,
  target: HTMLElement,
  name: string,
  assets: BaAssets,
  image: (url: string) => HTMLImageElement,
  reduced: boolean,
) {
  const snow = /Snow/.test(name);
  const rain = /Rain/.test(name);
  const ash = /Ash/.test(name);
  const cherry = /Cherry/.test(name);
  const fire = /Fire|Scatter/.test(name);
  const smoke = /Dust|Mist/.test(name);
  const storm = /Storm/.test(name);
  const count = reduced ? 8 : rain ? 50 : storm ? 44 : 24;
  for (let i = 0; i < count; i++) {
    const texture = smoke ? assets.effects.FX_TEX_Smoke_RGB_15 : '';
    const item = texture ? image(texture) : document.createElement('span');
    item.className = 'ba-main-atmosphere-particle';
    const color = snow
      ? '#fff'
      : cherry
        ? '#ffc1d9'
        : ash
          ? name.includes('Red')
            ? '#f56936'
            : '#242229'
          : fire
            ? '#ffb74a'
            : '#e4efff';
    Object.assign(item.style, {
      position: 'absolute',
      left: `${(i * 43) % 100}%`,
      top: `${fire ? 70 + ((i * 17) % 30) : (i * 37) % 100}%`,
      width: smoke
        ? '38%'
        : rain
          ? '1px'
          : cherry
            ? '9px'
            : snow
              ? `${2 + (i % 4)}px`
              : '3px',
      height: smoke
        ? '38%'
        : rain
          ? `${20 + (i % 25)}px`
          : cherry
            ? '5px'
            : snow
              ? `${2 + (i % 4)}px`
              : '3px',
      borderRadius: cherry ? '70% 10% 70% 10%' : '50%',
      background: texture ? 'transparent' : color,
      objectFit: 'contain',
      opacity: smoke ? '.2' : rain ? '.35' : '.65',
      transform: rain ? 'rotate(12deg)' : 'none',
    });
    target.append(item);
    const up = fire || smoke || ash;
    const dx = storm ? -35 : rain ? -8 : cherry ? 22 : i % 2 ? 10 : -10;
    const duration = rain
      ? 650
      : storm
        ? 2200
        : smoke
          ? 7000
          : cherry
            ? 6500
            : ash
              ? 6500
              : 4200;
    animate(
      host,
      item,
      [
        {
          transform: `translate(0,${up ? 18 : -20}vh) rotate(0deg) scale(.6)`,
          opacity: 0,
        },
        { opacity: smoke ? 0.22 : 0.7, offset: 0.25 },
        {
          transform: `translate(${dx}vw,${up ? -50 : 90}vh) rotate(${cherry ? 250 : 15}deg) scale(${smoke ? 1.5 : 1})`,
          opacity: 0,
        },
      ],
      { duration, delay: -(i * 251), iterations: Infinity },
      reduced,
    );
  }
  if (storm)
    target.style.background =
      'linear-gradient(20deg,#b2c1cc30,transparent,#e8edf018)';
  if (name === 'BG_Mist_L')
    target.style.background = 'linear-gradient(transparent,#dce7eb38)';
  if (fire)
    target.style.background = 'linear-gradient(transparent 60%,#ff6c2518)';
}

/** Returns false only for the original dust/under-fire path or an unknown ID. */
export function mainAtmosphere(
  host: HTMLElement,
  assets: BaAssets,
  image: (url: string) => HTMLImageElement,
  id: number,
  reduced: boolean,
  instant = false,
) {
  const plan = mainAtmospherePlan(id);
  if (!plan) throw new Error(`Unknown original background effect: ${id}`);
  if (!id) return true;
  const stage = host.parentElement;
  const background = stage?.querySelector<HTMLElement>('.ba-background');
  if (background) background.style.filter = plan.backgroundFilter;
  for (const canvas of stage?.querySelectorAll<HTMLElement>(
    '.ba-actors, .ba-signal',
  ) ?? [])
    canvas.style.filter = plan.characterFilter;
  host.dataset.atmosphere = plan.names.join(' + ');
  host.dataset.composition = 'browser';
  if (plan.finite) host.dataset.finite = 'true';
  if (
    plan.names.length === 1 &&
    ['BG_Dust_L', 'BG_UnderFire'].includes(plan.names[0])
  )
    return false;
  if (plan.names.length === 1 && legacy.has(plan.names[0]))
    return eventAtmosphere(host, assets, image, id, reduced);
  for (const name of plan.names) {
    if (/^Shader_|^BG_Filter_/.test(name)) continue;
    const target = layer(host, name);
    if (mainAtmosphereBehindCharacters(name)) {
      const actors = stage?.querySelector('.ba-actors');
      if (actors) {
        stage?.insertBefore(target, actors);
        const layers = externalLayers.get(host) ?? [];
        layers.push(target);
        externalLayers.set(host, layers);
      }
    }
    if (legacy.has(name)) {
      const nativeId = Object.values(effects).find(
        (row) => row.Effect === name && !row.Effect2,
      )?.Name;
      if (nativeId) eventAtmosphere(target, assets, image, nativeId, reduced);
      continue;
    }
    if (/^BG_UnderFire/.test(name)) {
      underFire(target, assets, image, reduced);
      if (name.endsWith('_R')) target.style.transform = 'scaleX(-1)';
      continue;
    }
    const scroll = /^BG_Scroll([BTLR])_([\d.]+)$/.exec(name);
    if (scroll) {
      const horizontal = ['L', 'R'].includes(scroll[1]);
      const direction = ['L', 'T'].includes(scroll[1]) ? -1 : 1;
      target.style.opacity = '.45';
      target.style.backgroundImage = `repeating-linear-gradient(${horizontal ? '0deg' : '90deg'},transparent 0 8%,#d6e5ff80 8.1%,transparent 8.4% 12%)`;
      animate(
        host,
        target,
        [
          {
            transform: `translate${horizontal ? 'X' : 'Y'}(${-direction * 10}%) scale(1.3)`,
          },
          {
            transform: `translate${horizontal ? 'X' : 'Y'}(${direction * 10}%) scale(1.3)`,
          },
        ],
        { duration: 2000 / Number(scroll[2]), iterations: Infinity },
        reduced,
      );
      continue;
    }
    if (/Film_Grain|TvNoise/.test(name)) {
      grain(host, target, reduced);
      if (/TvNoise/.test(name))
        target.style.background =
          'repeating-linear-gradient(transparent 0 3px,#dde5ef12 3px 4px)';
      continue;
    }
    if (/Flash(?:_Sound)?$|GrowupLight/.test(name)) {
      target.style.background = '#fff';
      target.style.opacity = '0';
      if (!instant)
        animate(
          host,
          target,
          [{ opacity: 0 }, { opacity: 0.92, offset: 0.12 }, { opacity: 0 }],
          { duration: name.includes('Growup') ? 1300 : 500, fill: 'both' },
          reduced,
        );
      continue;
    }
    if (/EyeOpen|EyeClose|TVTurnOff/.test(name)) {
      const close = !name.includes('EyeOpen');
      for (const edge of ['top', 'bottom']) {
        const lid = document.createElement('div');
        Object.assign(lid.style, {
          position: 'absolute',
          left: '0',
          right: '0',
          [edge]: '0',
          height: close ? '50%' : '0',
          background: '#000',
        });
        target.append(lid);
        if (!instant)
          animate(
            host,
            lid,
            [{ height: close ? '0' : '50%' }, { height: close ? '50%' : '0' }],
            {
              duration: name.includes('TV') ? 350 : 900,
              fill: 'both',
              easing: 'ease-in-out',
            },
            reduced,
          );
      }
      continue;
    }
    if (/WaveShort/.test(name)) {
      target.style.background =
        'radial-gradient(ellipse,transparent 40%,#fff9 49%,transparent 57%)';
      target.style.opacity = '0';
      if (!instant)
        animate(
          host,
          target,
          [
            { transform: 'scale(.05)', opacity: 0.6 },
            { transform: 'scale(2)', opacity: 0 },
          ],
          { duration: 900, fill: 'both' },
          reduced,
        );
      continue;
    }
    particles(host, target, name, assets, image, reduced);
  }
  return true;
}
