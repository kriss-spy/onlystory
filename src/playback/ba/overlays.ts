import type { BaAssets, BaState } from './types';
import { baResource } from './resources';
import emotionNames from './emotions.json';
import {
  mainAtmosphere,
  resetMainAtmosphere,
  finishMainAtmosphere,
} from './main-atmosphere';
import type { FaceBounds } from './emotion-layout';
import { underFire } from './under-fire';
import { emotionComposition } from './emotion-composition';
import { combatEffects, positionCombatEffect } from './combat-effects';
import { layoutBaCaptions } from './caption-layout';

const positions = [-0.5, -7 / 24, -1 / 6, 0, 1 / 6, 7 / 24];

async function smokeSprite(blob: Blob) {
  // Smoke_RGB_15 packs shader masks into RGB and has an opaque alpha channel.
  // Its green mask describes the smoke, while the red background is shader data.
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Smoke texture conversion is unavailable.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i + 3] = Math.round(
      (pixels.data[i + 1] * pixels.data[i + 3]) / 255,
    );
    pixels.data[i] = 140;
    pixels.data[i + 1] = 128;
    pixels.data[i + 2] = 116;
  }
  context.putImageData(pixels, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Smoke texture conversion failed.'));
    }, 'image/png'),
  );
}

async function additiveSprite(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Effect texture conversion unavailable.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const light = Math.max(
      pixels.data[i],
      pixels.data[i + 1],
      pixels.data[i + 2],
    );
    pixels.data[i + 3] = Math.round((pixels.data[i + 3] * light) / 255);
    if (light)
      for (let c = 0; c < 3; c++)
        pixels.data[i + c] = Math.round((pixels.data[i + c] * 255) / light);
  }
  context.putImageData(pixels, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('Effect texture conversion failed.')),
      'image/png',
    ),
  );
}

/** Authored atlas art and recovered effect textures; DOM composition shares the scene clock. */
export class BaOverlays {
  private caption = document.createElement('div');
  private emotions = document.createElement('div');
  private combat = document.createElement('div');
  private particles = document.createElement('div');
  private popup = document.createElement('div');
  private lastPopup = '';
  private images = new Map<string, string>();
  private urls: string[] = [];
  private captionRows = new Set<number>();
  private captionAnimations: Animation[] = [];
  private lastEffect = -1;
  private lastReduced = false;
  private animations: Animation[] = [];
  private disposed = false;
  private captionEntries: Parameters<typeof layoutBaCaptions>[1] = [];
  private captionResize = new ResizeObserver(() => this.layoutCaptions());
  private layoutCaptions() {
    layoutBaCaptions(this.host, this.captionEntries);
  }
  constructor(
    private host: HTMLDivElement,
    private assets: BaAssets,
    private signal: AbortSignal,
  ) {
    this.caption.className = 'ba-captions';
    this.emotions.className = 'ba-emotions';
    this.combat.className = 'ba-combat';
    this.particles.className = 'ba-particles';
    this.popup.className = 'ba-popup';
    host.append(
      this.particles,
      this.emotions,
      this.combat,
      this.popup,
      this.caption,
    );
    this.captionResize.observe(host);
    const dialogue = host
      .closest('.scene-reader')
      ?.querySelector('.dialogue-window');
    if (dialogue) this.captionResize.observe(dialogue);
  }
  async prepare() {
    await Promise.all(
      Object.values({
        ...this.assets.emotions,
        ...this.assets.effects,
        ...this.assets.popups,
      }).map(async (path) => {
        const response = await baResource(path, this.signal);
        let blob = await response.blob();
        if (path === this.assets.effects.FX_TEX_Smoke_RGB_15)
          blob = await smokeSprite(blob);
        if (
          path === this.assets.effects.FX_TEX_Bulletline_02 ||
          path === this.assets.effects.FX_TEX_Hit_01 ||
          Object.entries(this.assets.effects).some(
            ([name, url]) =>
              /^FX_TEX_(?:Flare_03|Noise_15|Lightning_RGB_02a|Circle_01|Stretch_Scroll_06)$/.test(
                name,
              ) && url === path,
          )
        )
          blob = await additiveSprite(blob);
        const url = URL.createObjectURL(blob);
        if (this.disposed) {
          URL.revokeObjectURL(url);
          return;
        }
        this.urls.push(url);
        this.images.set(path, url);
      }),
    );
  }
  private image(path: string) {
    const image = document.createElement('img');
    image.src = this.images.get(path) ?? path;
    image.alt = '';
    return image;
  }
  show(state: BaState, instant: boolean, reduced: boolean, speed: number) {
    if (state.popup !== this.lastPopup) {
      this.lastPopup = state.popup;
      this.popup.replaceChildren();
      if (state.popup) {
        const path = this.assets.popups?.[state.popup];
        if (!path)
          throw new Error(`Original popup unavailable: ${state.popup}`);
        this.popup.append(this.image(path));
      }
    }
    for (const a of this.animations) a.cancel();
    this.animations = [];
    this.animations.push(
      ...combatEffects(
        this.combat,
        state,
        this.assets,
        (path) => this.images.get(path) ?? path,
        instant || reduced,
      ),
    );
    this.emotions.replaceChildren();
    for (const actor of Object.values(state.actors).filter((a) => a.visible)) {
      if (actor.emotion) {
        const element = document.createElement('span');
        element.className = 'ba-emotion';
        element.dataset.character = actor.name;
        element.style.left = `${50 + positions[actor.position] * 100}%`;
        const name = (emotionNames as Record<string, string>)[actor.emotion];
        if (name) element.dataset.sprite = name;
        if (name) {
          const composition = emotionComposition(name);
          const layout = ['[?!]', '?!'].includes(actor.emotion)
            ? 'surprise'
            : composition.layout;
          if (layout) element.dataset.layout = layout;
          // Aggro and Action are individual pieces of multi-sprite effects.
          const pieces =
            layout === 'surprise'
              ? [{ sprite: name }, { sprite: 'Emoji_Question' }]
              : composition.pieces;
          for (const [i, piece] of pieces.entries()) {
            const image = this.image(this.assets.emotions[piece.sprite]);
            image.style.setProperty('--piece', String(i));
            if ('left' in piece) {
              image.style.left = `${piece.left}%`;
              image.style.top = `${piece.top}%`;
              image.style.width = `${piece.width}%`;
              image.style.height = `${piece.height}%`;
              image.style.objectFit = 'contain';
              image.style.transform = `rotate(${piece.angle ?? 0}deg)`;
            }
            element.append(image);
          }
        } else element.textContent = '…';
        this.emotions.append(element);
        if (!instant && !reduced)
          this.animations.push(
            element.animate(
              [
                { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
                { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1 },
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
              ],
              { duration: 300 },
            ),
          );
      }
      if (actor.fx === '{shot}' && !instant && !reduced) {
        const hit = this.image(this.assets.effects.FX_TEX_Hit_01);
        hit.className = 'ba-shot';
        hit.style.left = `${50 + positions[actor.position] * 100}%`;
        this.emotions.append(hit);
        this.animations.push(
          hit.animate(
            [
              { opacity: 0 },
              { opacity: 1, offset: 0.15 },
              { opacity: 0, offset: 0.25 },
              { opacity: 1, offset: 0.45 },
              { opacity: 0, offset: 0.55 },
              { opacity: 1, offset: 0.75 },
              { opacity: 0 },
            ],
            { duration: 550, fill: 'forwards' },
          ),
        );
      }
    }
    if (this.lastEffect !== state.effect || this.lastReduced !== reduced) {
      for (const animation of this.particles.getAnimations({ subtree: true }))
        animation.cancel();
      resetMainAtmosphere(this.particles);
      this.particles.replaceChildren();
      this.particles.style.background = '';
      delete this.particles.dataset.atmosphere;
      this.lastEffect = state.effect;
      this.lastReduced = reduced;
      this.host.dataset.effect = String(state.effect);
      if (state.effect === 3134544579)
        underFire(
          this.particles,
          this.assets,
          (path) => this.image(path),
          reduced,
        );
      else if (
        state.effect &&
        !mainAtmosphere(
          this.particles,
          this.assets,
          (path) => this.image(path),
          state.effect,
          reduced,
          instant,
        )
      )
        for (let i = 0; i < 12; i++) {
          const image = this.image(this.assets.effects.FX_TEX_Smoke_RGB_15);
          image.className = 'ba-dust';
          image.style.left = `${((i * 43) % 120) - 10}%`;
          image.style.bottom = `${((i * 7) % 15) - 10}%`;
          this.particles.append(image);
          if (!reduced)
            image.animate(
              [
                { transform: 'translate(-10vw,10vh) scale(.7)', opacity: 0 },
                { opacity: 0.3, offset: 0.4 },
                { transform: 'translate(10vw,-25vh) scale(1.5)', opacity: 0 },
              ],
              { duration: 4000, delay: -(i * 281), iterations: Infinity },
            );
        }
    }
    if (instant) this.finishParticles();
    this.reveal();
    this.caption.replaceChildren();
    this.captionEntries = [];
    for (const line of state.captions) {
      const element = document.createElement('p');
      element.className = 'ba-screen-text';
      element.style.color = line.color;
      if (line.alignment === 'right') {
        element.style.transform = 'translate(-100%, -50%)';
        element.style.textAlign = 'right';
      } else if (line.alignment === 'left') {
        element.style.transform = 'translate(0, -50%)';
        element.style.textAlign = 'left';
      }
      const animate =
        !instant &&
        !line.instant &&
        !reduced &&
        speed > 0 &&
        !this.captionRows.has(line.row);
      for (const [index, char] of Array.from(line.text).entries()) {
        const span = document.createElement('span');
        span.textContent = char;
        element.append(span);
        if (animate)
          this.captionAnimations.push(
            span.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 1,
              delay:
                (index / speed) * 1000 +
                (line.pauses ?? [])
                  .filter((pause) => pause.offset <= index)
                  .reduce((sum, pause) => sum + pause.delay, 0),
              fill: 'both',
            }),
          );
      }
      this.captionRows.add(line.row);
      this.caption.append(element);
      this.captionEntries.push({ element, line });
    }
    this.layoutCaptions();
    if (state.place) {
      const element = document.createElement('p');
      element.className = 'ba-place';
      element.textContent = state.place;
      this.caption.append(element);
    }
    if (state.title) {
      const element = document.createElement('p');
      element.className = 'ba-title';
      element.style.left = '50%';
      element.style.top = '50%';
      element.style.fontSize = `${Math.max(20, this.host.clientHeight / 18)}px`;
      element.textContent = state.title;
      this.caption.append(element);
    }
  }
  positionEmotion(character: string, face: FaceBounds) {
    positionCombatEffect(this.combat, character, face);
    const element = Array.from(
      this.emotions.querySelectorAll<HTMLElement>('.ba-emotion'),
    ).find((el) => el.dataset.character === character);
    if (!element) return;
    const image = element.querySelector('img');
    const height = Math.max(24, this.host.clientHeight * 0.1);
    const width =
      height *
      (element.dataset.layout
        ? element.dataset.layout === 'surprise'
          ? 1.25
          : 1
        : image?.naturalWidth && image.naturalHeight
          ? image.naturalWidth / image.naturalHeight
          : 0.75);
    const gap = height * 0.15;
    let x = face.left - gap - width / 2;
    if (x - width / 2 < 4) x = face.right + gap + width / 2;
    x = Math.max(
      width / 2 + 4,
      Math.min(this.host.clientWidth - width / 2 - 4, x),
    );
    const y = Math.max(
      height / 2 + 4,
      Math.min(
        this.host.clientHeight - height / 2 - 4,
        face.top - height * 0.5,
      ),
    );
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.height = `${height}px`;
    if (element.dataset.layout) element.style.width = `${width}px`;
  }
  reveal() {
    for (const a of this.captionAnimations) a.finish();
    this.captionAnimations = [];
  }
  private finishParticles() {
    finishMainAtmosphere(this.particles);
    if (this.particles.dataset.atmosphere !== 'BG_UnderFire') return;
    for (const element of this.particles.children)
      for (const animation of element.getAnimations()) animation.finish();
  }
  finish() {
    this.reveal();
    this.finishParticles();
    for (const a of this.animations) a.finish();
    this.animations = [];
  }
  dispose() {
    this.disposed = true;
    this.captionResize.disconnect();
    this.finish();
    for (const animation of this.particles.getAnimations({ subtree: true }))
      animation.cancel();
    resetMainAtmosphere(this.particles);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.caption.remove();
    this.particles.remove();
    this.popup.remove();
    this.emotions.remove();
    this.combat.remove();
  }
}
