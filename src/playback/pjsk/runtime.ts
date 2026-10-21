import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  Ticker,
  filters,
  Filter,
  Rectangle,
  BLEND_MODES,
} from 'pixi.js';
import '../pixi-csp';
import type {
  Live2DModel,
  Cubism4MotionManager,
  Cubism4InternalModel,
} from 'pixi-live2d-display/cubism4';
import { cachedResponse, loadLive2D, localModel } from '../gfl2/resources';
import { createAudioOutput } from '../audio-output';
import type {
  Program,
  SceneState,
  CharacterState,
  Command,
  NativeRecord,
} from './types';

interface ModelView {
  model: Live2DModel;
  facial: Cubism4MotionManager;
  release: () => void;
  motion: string;
  expression: string;
  request: number;
  color: InstanceType<typeof filters.ColorMatrixFilter>;
  hologram: Filter;
  monitor: Filter;
  blur: InstanceType<typeof filters.BlurFilter>;
}
interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
  name: string;
  kind: 'music' | 'sound';
}
type EffectKind = NonNullable<Program['media']['effectAssets']>[string]['kind'];

export class PjskPlayer {
  private app: Application;
  private world = new Container();
  private actors = new Container();
  private scene = new Container();
  private overlays = new Graphics();
  private particles = new Container();
  private particleFrames: Texture[] = [];
  private particleKey = '';
  private spriteEffects = new Set<string>();
  private effectSpriteState = new Map<
    Sprite,
    { kind: EffectKind; index: number; name: string; started: number }
  >();
  private background = new Sprite(Texture.WHITE);
  private videoLayer = new Sprite(Texture.EMPTY);
  private curtain = new Graphics();
  private models = new Map<string, ModelView>();
  private textures = new Map<string, Texture>();
  private videoBackgrounds = new Map<string, HTMLVideoElement>();
  private activeVideo: HTMLVideoElement | null = null;
  private imageUrls: string[] = [];
  private controller = new AbortController();
  private run = new AbortController();
  private observer: ResizeObserver;
  private ready: Promise<void>;
  private revision = 0;
  private lastIndex = -1;
  private state: SceneState | null = null;
  private context = new AudioContext();
  private output = createAudioOutput(this.context);
  private musicBus = this.context.createGain();
  private soundBus = this.context.createGain();
  private buffers = new Map<string, AudioBuffer>();
  private music: Playing | null = null;
  private playing = new Set<Playing>();
  private reduced = false;
  private disposed = false;
  private tweeners = new Map<
    object,
    {
      from: Record<string, number>;
      to: Record<string, number>;
      started: number;
      duration: number;
    }
  >();
  private flash = new filters.ColorMatrixFilter();
  private memoryTint = new filters.ColorMatrixFilter();
  private blur = new filters.BlurFilter(8);
  private camera = { x: 0, y: 0, zoom: 1 };
  private shakeUntil = 0;
  private lastCommand = -1;
  private animations = new Set<Animation>();
  private voice: (() => number) | undefined;

  constructor(
    private host: HTMLElement,
    readonly program: Program,
    private caption: HTMLElement,
    private report: (message: string) => void,
    private blocked: (value: boolean) => void,
  ) {
    this.app = new Application({
      width: 1280,
      height: 720,
      backgroundColor: 0x000000,
      antialias: true,
      autoDensity: true,
      resolution: 2,
    });
    this.app.view.setAttribute('aria-label', 'Original Project SEKAI scene');
    this.app.view.setAttribute('role', 'img');
    host.append(this.app.view as HTMLCanvasElement);
    this.background.width = 1280;
    this.background.height = 720;
    this.actors.sortableChildren = true;
    this.scene.pivot.set(640, 360);
    this.scene.position.set(640, 360);
    this.scene.addChild(
      this.background,
      this.actors,
      this.particles,
      this.overlays,
    );
    this.videoLayer.visible = false;
    this.world.addChild(this.scene, this.curtain, this.videoLayer);
    this.app.stage.addChild(this.world);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.app.ticker.add(() => this.tick());
    this.musicBus.connect(this.output.input);
    this.soundBus.connect(this.output.input);
    this.context.onstatechange = () => {
      if (!this.disposed) this.blocked(this.context.state !== 'running');
    };
    this.blocked(this.context.state !== 'running');
    this.ready = this.load();
    void this.ready.catch(() => {});
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    const scale = Math.min(w / 1280, h / 720);
    // Thin facial meshes shimmer at 1x on desktop displays. Keep two samples
    // per native scene pixel, capped at 2x so large windows need no extra scale.
    const resolution = Math.min(2, Math.max(devicePixelRatio || 1, 2 / scale));
    this.app.renderer.resolution = resolution;
    this.flash.resolution = this.blur.resolution = resolution;
    for (const view of this.models.values())
      for (const filter of [view.color, view.hologram, view.blur])
        filter.resolution = resolution;
    this.app.renderer.resize(w, h);
    this.world.scale.set(scale);
    this.world.position.set((w - 1280 * scale) / 2, (h - 720 * scale) / 2);
  }

  private async load() {
    const signal = this.controller.signal;
    const {
      Live2DModel,
      Cubism4MotionManager,
      MotionPreloadStrategy,
      Cubism4ModelSettings,
    } = await loadLive2D();
    Live2DModel.registerTicker(Ticker);
    for (const [name, asset] of Object.entries(this.program.media.models)) {
      signal.throwIfAborted();
      const local = await localModel(asset.url, signal);
      let model: Live2DModel | undefined;
      try {
        const settings = new Cubism4ModelSettings(local.settings);
        settings.resolveURL = (path) =>
          path.startsWith('blob:')
            ? path
            : new URL(path, local.settings.url).href;
        model = await Live2DModel.from(settings, {
          autoInteract: false,
          motionPreload: MotionPreloadStrategy.NONE,
          autoUpdate: false,
        });
        signal.throwIfAborted();
        const internal = model.internalModel as Cubism4InternalModel;
        const facial = new Cubism4MotionManager(internal.settings, {
          motionPreload: MotionPreloadStrategy.NONE,
        });
        // Parse every track before reading so seeking never fetches or parses
        // a new motion in the passage-change path.
        try {
          await Promise.all([
            ...asset.motions.map((_, index) =>
              internal.motionManager.loadMotion('Motion', index),
            ),
            ...asset.expressions.map((_, index) =>
              facial.loadMotion('Facial', index),
            ),
          ]);
          signal.throwIfAborted();
        } catch (error) {
          facial.destroy();
          throw error;
        }
        const color = new filters.ColorMatrixFilter();
        color.resolution = this.app.renderer.resolution;
        model.filters = [];
        const hologram = new Filter(
          undefined,
          `
          varying vec2 vTextureCoord;
          uniform sampler2D uSampler;
          uniform float time;
          void main(void) {
            vec4 color = texture2D(uSampler, vTextureCoord);
            float line = 0.83 + 0.17 * sin(vTextureCoord.y * 900.0 + time * 3.0);
            color.rgb *= vec3(0.55, 0.95, 1.1) * line;
            gl_FragColor = color * 0.78;
          }
        `,
          { time: 0 },
        );
        const view: ModelView = {
          model,
          facial,
          release: local.release,
          motion: '',
          expression: '',
          request: 0,
          color,
          hologram,
          monitor: new Filter(
            undefined,
            `
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform float time;
            void main(void) {
              vec4 color = texture2D(uSampler, vTextureCoord);
              float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
              float scan = 0.9 + 0.1 * sin(vTextureCoord.y * 1100.0 - time * 2.0);
              color.rgb = mix(color.rgb, vec3(grey * 0.85, grey * 0.95, grey), 0.3) * scan;
              gl_FragColor = color;
            }
          `,
            { time: 0 },
          ),
          blur: new filters.BlurFilter(8),
        };
        const core = internal.coreModel;
        for (const filter of [color, hologram, view.monitor, view.blur])
          filter.resolution = this.app.renderer.resolution;
        model.internalModel.on('beforeModelUpdate', () => {
          // Cubism motion managers consume seconds, unlike the Pixi ticker.
          facial.update(core, performance.now() / 1000);
          const level = this.voice?.() ?? 0;
          if (
            this.state?.characters[String(asset.id)]?.costume === name &&
            this.currentSpeaker === asset.id
          )
            core.setParameterValueById(
              'ParamMouthOpenY',
              Math.min(1, level * 5),
            );
        });
        model.anchor.set(0.5, 0);
        model.scale.set(900 / model.internalModel.height);
        model.visible = false;
        this.actors.addChild(model);
        this.models.set(name, view);
      } catch (error) {
        model?.destroy();
        local.release();
        throw error;
      }
    }
    const imageReferences = {
      ...Object.fromEntries(
        Object.entries(this.program.media.backgrounds).filter(
          ([name]) => !this.program.media.videoBackgrounds?.[name],
        ),
      ),
      ...this.program.media.effects,
    };
    for (const [name, asset] of Object.entries(
      this.program.media.effectAssets ?? {},
    )) {
      if (asset.textures.length) imageReferences[name] = asset.textures[0];
      for (const url of asset.textures) imageReferences[`effect:${url}`] = url;
    }
    const imageGroups = new Map<string, string[]>();
    for (const [name, url] of Object.entries(imageReferences))
      imageGroups.set(url, [...(imageGroups.get(url) ?? []), name]);
    await Promise.all(
      [...imageGroups].map(async ([url, names]) => {
        const response = await cachedResponse(url, signal);
        const object = URL.createObjectURL(await response.blob());
        try {
          const texture = await Texture.fromURL(object);
          signal.throwIfAborted();
          this.imageUrls.push(object);
          for (const name of names) this.textures.set(name, texture);
        } catch (error) {
          URL.revokeObjectURL(object);
          throw error;
        }
      }),
    );
    await Promise.all(
      Object.entries(this.program.media.videoBackgrounds ?? {}).map(
        async ([name, asset]) => {
          const response = await cachedResponse(asset.url, signal);
          const object = URL.createObjectURL(await response.blob());
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.loop = asset.loop;
          video.preload = 'auto';
          try {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                video.removeEventListener('loadeddata', loaded);
                video.removeEventListener('error', failed);
                signal.removeEventListener('abort', aborted);
              };
              const loaded = () => {
                if (
                  video.readyState < 2 ||
                  !video.videoWidth ||
                  !video.videoHeight
                )
                  return;
                cleanup();
                resolve();
              };
              const failed = () => {
                cleanup();
                reject(
                  new Error(
                    `Original video background could not be decoded: ${name}`,
                  ),
                );
              };
              const aborted = () => {
                cleanup();
                reject(
                  new DOMException(
                    'Video background loading was canceled.',
                    'AbortError',
                  ),
                );
              };
              signal.addEventListener('abort', aborted, { once: true });
              video.addEventListener('loadeddata', loaded);
              video.addEventListener('error', failed);
              video.src = object;
              video.load();
              if (signal.aborted) aborted();
            });
            signal.throwIfAborted();
            const texture = Texture.from(video, {
              resourceOptions: { autoPlay: false, updateFPS: 30 },
            });
            if (!texture.baseTexture.valid)
              throw new Error(
                `Original video background has no decoded first frame: ${name}`,
              );
            this.imageUrls.push(object);
            this.videoBackgrounds.set(name, video);
            this.textures.set(name, texture);
          } catch (error) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(object);
            throw error;
          }
        },
      ),
    );
    await Promise.all(
      [
        ...new Set([
          ...Object.values(this.program.media.music),
          ...Object.values(this.program.media.sounds),
        ]),
      ].map((url) => this.buffer(url)),
    );
  }
  private currentSpeaker = 0;
  private playVideoBackground(video: HTMLVideoElement) {
    void video.play().catch((error) => {
      if (
        !this.disposed &&
        this.activeVideo === video &&
        error.name !== 'AbortError'
      )
        this.report(error.message);
    });
  }
  configure(
    music: number,
    sound: number,
    reduced: boolean,
    voice?: () => number,
  ) {
    this.musicBus.gain.value = music;
    this.soundBus.gain.value = sound;
    this.reduced = reduced;
    if (this.activeVideo) {
      if (reduced) this.activeVideo.pause();
      else this.playVideoBackground(this.activeVideo);
    }
    this.voice = voice;
  }
  async enableAudio() {
    await this.context.resume();
    this.blocked(this.context.state !== 'running');
  }
  private async buffer(url: string) {
    const existing = this.buffers.get(url);
    if (existing) return existing;
    const response = await cachedResponse(url, this.controller.signal);
    const buffer = await this.context.decodeAudioData(
      await response.arrayBuffer(),
    );
    this.controller.signal.throwIfAborted();
    this.buffers.set(url, buffer);
    return buffer;
  }
  private async play(
    name: string,
    kind: 'music' | 'sound',
    volume = 1,
    duration = 0,
    signal = this.run.signal,
    loop = kind === 'music',
  ) {
    if (kind === 'music' && this.music?.name === name) {
      this.fade(this.music, volume, duration);
      return;
    }
    if (
      kind === 'sound' &&
      loop &&
      [...this.playing].some(
        (playing) =>
          playing.kind === 'sound' &&
          playing.name === name &&
          playing.source.loop,
      )
    )
      return;
    const url = (
      kind === 'music' ? this.program.media.music : this.program.media.sounds
    )[name];
    const previous = this.music;
    if (kind === 'music' && previous) {
      previous.gain.gain.cancelScheduledValues(this.context.currentTime);
      previous.gain.gain.setValueAtTime(
        previous.gain.gain.value,
        this.context.currentTime,
      );
      previous.gain.gain.linearRampToValueAtTime(
        0,
        this.context.currentTime + duration,
      );
      previous.source.stop(this.context.currentTime + duration + 0.02);
      this.music = null;
    }
    if (name === 'bgm00000' || !name) return;
    if (!url) throw new Error(`Missing original ${kind}: ${name}`);
    const buffer = await this.buffer(url);
    signal.throwIfAborted();
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    gain.connect(kind === 'music' ? this.musicBus : this.soundBus);
    gain.gain.setValueAtTime(
      duration > 0 ? 0 : volume,
      this.context.currentTime,
    );
    if (duration > 0)
      gain.gain.linearRampToValueAtTime(
        volume,
        this.context.currentTime + duration,
      );
    const playing = { source, gain, name, kind };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.playing.delete(playing);
    };
    this.playing.add(playing);
    if (kind === 'music') this.music = playing;
    source.start();
  }
  private fade(
    playing: Playing,
    volume: number,
    duration: number,
    stop = false,
  ) {
    const gain = playing.gain.gain;
    gain.cancelScheduledValues(this.context.currentTime);
    gain.setValueAtTime(gain.value, this.context.currentTime);
    gain.linearRampToValueAtTime(volume, this.context.currentTime + duration);
    if (stop) playing.source.stop(this.context.currentTime + duration + 0.02);
  }
  private stopSounds(preserveMusic = false) {
    for (const playing of this.playing) {
      if (preserveMusic && playing === this.music) continue;
      try {
        playing.source.stop();
      } catch {
        /* Already ended. */
      }
      this.playing.delete(playing);
    }
    if (!preserveMusic) this.music = null;
  }
  private tween(target: object, to: Record<string, number>, duration: number) {
    this.tweeners.delete(target);
    if (!duration || this.reduced) {
      Object.assign(target, to);
      return;
    }
    const object = target as Record<string, number>;
    this.tweeners.set(target, {
      from: Object.fromEntries(
        Object.keys(to).map((key) => [key, object[key]]),
      ),
      to,
      started: performance.now(),
      duration: duration * 1000,
    });
  }
  private tick() {
    const now = performance.now();
    for (const [target, tween] of this.tweeners) {
      const progress = Math.min(1, (now - tween.started) / tween.duration);
      const object = target as Record<string, number>;
      for (const key of Object.keys(tween.to))
        object[key] =
          tween.from[key] + (tween.to[key] - tween.from[key]) * progress;
      if (progress === 1) this.tweeners.delete(target);
    }
    this.scene.position.set(640 + this.camera.x, 360 + this.camera.y);
    this.scene.scale.set(this.camera.zoom);
    this.drawOverlays(now);
    for (let i = 0; i < this.particles.children.length; i++) {
      const particle = this.particles.children[i] as Sprite;
      const time = this.reduced ? 0 : now / 1000;
      const effectSprite = this.effectSpriteState.get(particle);
      if (effectSprite) {
        const { kind, index } = effectSprite;
        if (kind === 'image' || kind === 'vignette') continue;
        if (kind === 'eye') {
          const progress = this.reduced
            ? 1
            : Math.min(1, Math.max(0, (time - effectSprite.started) / 0.5));
          particle.alpha = effectSprite.name.includes('open')
            ? 1 - progress
            : progress;
          continue;
        }
        const falling = ['rain', 'snow', 'petals'].includes(kind);
        const speed = kind === 'rain' ? 450 : falling ? 25 : -15;
        particle.x =
          ((index * 197) % 1280) +
          Math.sin(time * 0.5 + index) * (kind === 'rain' ? 0 : 25);
        particle.y = ((((index * 137 + time * speed) % 920) + 920) % 920) - 100;
        if (kind === 'flare') {
          particle.x = 180 + index * 420;
          particle.y = 180 + index * 60;
        }
        particle.rotation =
          kind === 'petals' || kind === 'particles' ? time * 0.15 + index : 0;
        particle.alpha =
          kind === 'rain' ? 0.3 : 0.2 + (Math.sin(time + index) + 1) * 0.2;
        if (kind === 'lines' || kind === 'glitch') {
          particle.x = ((index * 173 + time * 900) % 1600) - 160;
          particle.y = (index * 47) % 720;
        }
        continue;
      }
      if ((particle.name ?? '').startsWith('legend-')) {
        const index = Number(particle.name.split(':')[1]);
        if (particle.name.startsWith('legend-fog:')) {
          const phase = (time / 10 + index * 0.19) % 1;
          particle.x = 128 + index * 250 + Math.sin(phase * Math.PI * 2) * 45;
          particle.y = 750 - phase * 95;
          particle.alpha = Math.sin(phase * Math.PI) * 0.45;
        } else {
          particle.x = index ? 768 : 250;
          particle.y = index ? 144 : 170;
          particle.alpha = 0.25 + (Math.sin(time * 2.5 + index) + 1) * 0.1;
        }
        continue;
      }
      particle.x = ((i * 197) % 1280) + Math.sin(time * 0.3 + i) * 18;
      particle.y =
        ((((i * 137 - time * (12 + (i % 11))) % 820) + 820) % 820) - 50;
      particle.rotation = this.reduced ? i : time * 0.08 + i;
      particle.alpha = 0.35 + (Math.sin(time + i) + 1) * 0.2;
    }
    this.actors.pivot.set(
      !this.reduced && now < this.shakeUntil ? Math.sin(now / 27) * 5 : 0,
      0,
    );
    for (const view of this.models.values())
      if (view.model.visible) {
        view.hologram.uniforms.time = now / 1000;
        view.monitor.uniforms.time = now / 1000;
        view.model.update(this.reduced ? 0 : this.app.ticker.deltaMS);
      }
  }
  private drawOverlays(now: number) {
    this.overlays.clear();
    for (const name of this.state?.scenarioEffects ?? []) {
      if (this.spriteEffects.has(name)) continue;
      if (name.startsWith('still_') || name === 'light_up_legend_02') continue;
      if (name === 'eye_close_quick_01') {
        this.overlays
          .beginFill(0x000000)
          .drawEllipse(640, -150, 900, 440)
          .drawEllipse(640, 870, 900, 440)
          .endFill();
        continue;
      }
      if (name === 'black_out_02') {
        this.overlays
          .beginFill(0x000000, 0.82)
          .drawRect(0, 0, 1280, 720)
          .endFill();
        continue;
      }
      const rain = name === 'rain_07';
      const bug = name.startsWith('bug_');
      const direction = name.endsWith('_l') ? -1 : 1;
      const phase = this.reduced ? 0 : now / (rain ? 5 : 2);
      this.overlays.lineStyle(
        rain ? 1 : bug ? 3 : 2,
        bug ? 0x90ffff : 0xffffff,
        rain ? 0.3 : 0.45,
      );
      for (let i = 0; i < (rain ? 100 : 32); i++) {
        const x = ((((i * 197 + phase * direction) % 1440) + 1440) % 1440) - 80;
        const y = ((i * 83 + (rain ? phase * 3 : 0)) % 820) - 50;
        this.overlays
          .moveTo(x, y)
          .lineTo(
            x + (rain ? -20 : bug ? 170 : 230) * direction,
            y + (rain ? 75 : name === 'line' ? (y - 360) * 0.16 : 0),
          );
      }
    }
  }
  private syncParticles(names: string[]) {
    const key = names.join(',');
    if (key === this.particleKey) return;
    this.particleKey = key;
    this.spriteEffects.clear();
    this.effectSpriteState.clear();
    for (const child of this.particles.removeChildren()) child.destroy();
    for (const frame of this.particleFrames) frame.destroy(false);
    this.particleFrames = [];
    for (const name of names) {
      const atlas = this.textures.get(name);
      if (!atlas) throw new Error(`Missing scenario particle texture ${name}`);
      this.spriteEffects.add(name);
      if (name === 'light_up_legend_02') {
        // This native 512px atlas has fog at top-left and lens flares in the
        // next two 256px cells. Keep those layers separate from the stills.
        for (let i = 0; i < 7; i++) {
          const cell = i < 5 ? 0 : i - 4;
          const frame = new Texture(
            atlas.baseTexture,
            new Rectangle(
              (cell % 2) * 256,
              Math.floor(cell / 2) * 256,
              256,
              256,
            ),
          );
          this.particleFrames.push(frame);
          const particle = new Sprite(frame);
          particle.name = i < 5 ? `legend-fog:${i}` : `legend-flare:${i - 5}`;
          particle.anchor.set(0.5);
          particle.width = particle.height = i < 5 ? 820 : 504;
          particle.blendMode = BLEND_MODES.ADD;
          this.particles.addChild(particle);
        }
        continue;
      }
      const inspectedStill = [
        'still_kanade_nig14_01',
        'still_mizuki_nig19_01',
        'still_ena_nig19_01',
      ].includes(name);
      if (!inspectedStill) {
        const asset = this.program.media.effectAssets?.[name];
        let kind: EffectKind = asset?.kind ?? 'image';
        if (
          /^still_|kirakira|star|smoke|mist|flower|paper|sakura|dust|aura/.test(
            name,
          )
        )
          kind = /^sakura|flower|paper/.test(name) ? 'petals' : 'particles';
        if (/^rain/.test(name)) kind = 'rain';
        if (/^snow/.test(name)) kind = 'snow';
        const count = ['image', 'vignette', 'eye'].includes(kind)
          ? 1
          : kind === 'flare'
            ? 3
            : kind === 'rain'
              ? 60
              : 24;
        const urls = asset?.textures ?? [];
        for (let index = 0; index < count; index++) {
          const source = urls.length
            ? (this.textures.get(`effect:${urls[index % urls.length]}`) ??
              atlas)
            : atlas;
          const columns = asset?.columns ?? 1,
            rows = asset?.rows ?? 1;
          if (
            ![columns, rows].every(
              (value) => Number.isInteger(value) && value >= 1,
            )
          )
            throw new Error(`Invalid original effect atlas layout ${name}`);
          const cell = index % (columns * rows);
          const frame = new Texture(
            source.baseTexture,
            new Rectangle(
              ((cell % columns) * source.width) / columns,
              (Math.floor(cell / columns) * source.height) / rows,
              source.width / columns,
              source.height / rows,
            ),
          );
          this.particleFrames.push(frame);
          const sprite = new Sprite(frame);
          sprite.anchor.set(0.5);
          if (['image', 'vignette', 'eye'].includes(kind)) {
            sprite.position.set(640, 360);
            sprite.width = 1280;
            sprite.height = 720;
          } else {
            sprite.width =
              kind === 'rain'
                ? 18
                : kind === 'flare'
                  ? 600
                  : 18 + (index % 4) * 10;
            sprite.height = kind === 'rain' ? 90 : sprite.width;
          }
          if (kind === 'flare' || /kirakira|star|light|aura/.test(name))
            sprite.blendMode = BLEND_MODES.ADD;
          this.effectSpriteState.set(sprite, {
            kind,
            index,
            name,
            started: performance.now() / 1000,
          });
          this.particles.addChild(sprite);
        }
        continue;
      }
      // The extracted still_* textures are particle atlases, not illustrations.
      // Native backgrounds contain the full still. Sample individual atlas cells
      // for a lightweight particle approximation over that original background.
      const cells = atlas.width >= 512 && atlas.height >= 512 ? 4 : 1;
      for (let i = 0; i < 24; i++) {
        const cell = i % (cells * cells);
        const frame = new Texture(
          atlas.baseTexture,
          new Rectangle(
            ((cell % cells) * atlas.width) / cells,
            (Math.floor(cell / cells) * atlas.height) / cells,
            atlas.width / cells,
            atlas.height / cells,
          ),
        );
        this.particleFrames.push(frame);
        const particle = new Sprite(frame);
        particle.anchor.set(0.5);
        particle.width = particle.height = 22 + (i % 4) * 10;
        this.particles.addChild(particle);
      }
    }
  }
  private async character(
    view: ModelView,
    state: CharacterState,
    instant: boolean,
    duration: number,
    forceMotion = false,
    forceFacial = false,
    signal = this.run.signal,
  ) {
    const visible = view.model.visible;
    view.model.visible = state.visible;
    view.model.zIndex = 10 - state.depth;
    const scale = this.state?.layoutMode === 3 ? 1.8 / 2.1 : 1;
    view.model.scale.set((900 * scale) / view.model.internalModel.height);
    view.color.reset();
    const tint =
      this.state?.ambient === 'evening'
        ? [1, 0.87, 0.73]
        : this.state?.ambient === 'night'
          ? [0.77, 0.82, 1]
          : [1, 1, 1];
    view.color.matrix[0] = tint[0];
    view.color.matrix[6] = tint[1];
    view.color.matrix[12] = tint[2];
    const shader = this.state?.characterShaders?.[String(state.id)];
    view.blur.blur = this.state?.characterBlur?.[String(state.id)] ?? 8;
    const colorFilters = tint.some((channel) => channel !== 1)
      ? [view.color]
      : [];
    view.model.filters =
      shader === 'hologram'
        ? [...colorFilters, view.hologram]
        : shader === 'monitor'
          ? [...colorFilters, view.monitor]
          : shader === 'blur'
            ? [...colorFilters, view.blur]
            : colorFilters;
    if (!visible && !instant) {
      view.model.x = state.fromX;
      view.model.y = state.fromY ?? 15;
    }
    this.tween(
      view.model,
      { x: state.x, y: state.y ?? 15, alpha: state.visible ? 1 : 0 },
      instant ? 0 : duration,
    );
    const asset = this.program.media.models[state.costume];
    if (
      state.motion &&
      (instant || forceMotion || view.motion !== state.motion)
    ) {
      view.motion = state.motion;
      const index = asset.motions.indexOf(state.motion);
      if (index < 0) throw new Error(`Missing motion ${state.motion}`);
      const motion = await view.model.internalModel.motionManager.loadMotion(
        'Motion',
        index,
      );
      signal.throwIfAborted();
      // A snapshot needs its pose on the first rendered frame. Fading from
      // default parameters briefly exposes the model's unposed arms on seeks.
      motion?.setFadeInTime(instant || this.reduced ? 0 : 0.1);
      await view.model.motion('Motion', index, 3);
      signal.throwIfAborted();
    }
    if (
      state.expression &&
      (instant || forceFacial || view.expression !== state.expression)
    ) {
      view.expression = state.expression;
      const index = asset.expressions.indexOf(state.expression);
      if (index < 0)
        throw new Error(`Missing facial motion ${state.expression}`);
      const facial = await view.facial.loadMotion('Facial', index);
      signal.throwIfAborted();
      facial?.setIsLoop(true);
      // Fade into a new expression once. Repeating the fade at every loop
      // briefly exposes the body's open eyes during closed-eye expressions.
      facial?.setIsLoopFadeIn(false);
      facial?.setFadeInTime(instant || this.reduced ? 0 : 0.1);
      await view.facial.startMotion('Facial', index, 3);
    }
    if (instant || this.reduced) view.model.update(1);
  }
  private async apply(
    state: SceneState,
    instant: boolean,
    duration = 0,
    record?: NativeRecord | null,
    signal = this.run.signal,
  ) {
    signal.throwIfAborted();
    const previous = this.state;
    this.state = state;
    const texture = this.textures.get(state.background);
    if (!texture) throw new Error(`Missing background ${state.background}`);
    this.background.texture = texture;
    const video = this.videoBackgrounds.get(state.background) ?? null;
    // The two reviewed movie backgrounds are inserted under a persistent
    // native white curtain. Keep that state intact and present only those
    // explicitly marked clips above it while their background is active.
    const overlay =
      !!video &&
      this.program.media.videoBackgrounds?.[state.background]?.presentation ===
        'overlay';
    this.background.visible = !overlay;
    this.videoLayer.visible = overlay;
    if (overlay) {
      this.videoLayer.texture = texture;
      this.videoLayer.width = 1280;
      this.videoLayer.height = 720;
    }
    if (video !== this.activeVideo) {
      this.activeVideo?.pause();
      this.activeVideo = video;
    }
    if (video && video.paused && !this.reduced) this.playVideoBackground(video);
    this.background.width = 1280;
    this.background.height = 720;
    const sceneFilters: Filter[] = [];
    if (state.flashback) {
      this.flash.resolution = this.app.renderer.resolution;
      this.flash.desaturate();
      sceneFilters.push(this.flash);
    }
    if (state.blur) sceneFilters.push(this.blur);
    if (state.memory) {
      this.memoryTint.reset();
      this.memoryTint.saturate(-0.5, false);
      for (let i = 0; i < 15; i++)
        this.memoryTint.matrix[i] *= i < 10 ? 0.8 : 0.5;
      sceneFilters.push(this.memoryTint);
    }
    this.scene.filters = sceneFilters.length ? sceneFilters : null;
    if (
      instant ||
      JSON.stringify(previous?.camera) !== JSON.stringify(state.camera)
    )
      this.tween(
        this.camera,
        state.camera ?? { x: 0, y: 0, zoom: 1 },
        instant ? 0 : duration,
      );
    this.syncParticles(
      (state.scenarioEffects ?? []).filter(
        (name) =>
          this.textures.has(name) ||
          name.startsWith('still_') ||
          name === 'light_up_legend_02',
      ),
    );
    this.curtain
      .clear()
      .beginFill(state.curtain.color === 'white' ? 0xffffff : 0x000000)
      .drawRect(0, 0, 1280, 720)
      .endFill();
    if (
      instant ||
      JSON.stringify(previous?.curtain) !== JSON.stringify(state.curtain)
    ) {
      if (state.curtain.wipe) {
        const previousWipe = previous?.curtain.wipe;
        const coverage = previousWipe
          ? ['left', 'right'].includes(previousWipe)
            ? this.curtain.scale.x
            : this.curtain.scale.y
          : this.curtain.alpha;
        const horizontal = ['left', 'right'].includes(state.curtain.wipe);
        this.curtain.alpha = 1;
        this.curtain.x = state.curtain.wipe === 'right' ? 1280 : 0;
        this.curtain.pivot.x = state.curtain.wipe === 'right' ? 1280 : 0;
        this.curtain.y = state.curtain.wipe === 'bottom' ? 720 : 0;
        this.curtain.pivot.y = state.curtain.wipe === 'bottom' ? 720 : 0;
        this.curtain.scale.set(
          horizontal ? coverage : 1,
          horizontal ? 1 : coverage,
        );
        this.tween(
          this.curtain.scale,
          horizontal ? { x: state.curtain.alpha } : { y: state.curtain.alpha },
          instant ? 0 : duration,
        );
      } else {
        if (previous?.curtain.wipe)
          this.curtain.alpha = ['left', 'right'].includes(previous.curtain.wipe)
            ? this.curtain.scale.x
            : this.curtain.scale.y;
        this.curtain.x = 0;
        this.curtain.pivot.x = 0;
        this.curtain.y = 0;
        this.curtain.pivot.y = 0;
        this.curtain.scale.set(1);
        this.tween(
          this.curtain,
          { alpha: state.curtain.alpha },
          instant ? 0 : duration,
        );
      }
    }
    for (const [costume, view] of this.models) {
      signal.throwIfAborted();
      const actor = Object.values(state.characters).find(
        (c) => c.costume === costume,
      );
      if (!actor) {
        view.model.visible = false;
        continue;
      }
      const motion =
        record?.Character2dId === actor.id
          ? record
          : record?.Motions?.find((m) => m.Character2dId === actor.id);
      if (
        instant ||
        motion?.MotionName ||
        motion?.FacialName ||
        previous?.ambient !== state.ambient ||
        previous?.layoutMode !== state.layoutMode ||
        previous?.characterShaders?.[String(actor.id)] !==
          state.characterShaders?.[String(actor.id)] ||
        JSON.stringify(previous?.characters[String(actor.id)]) !==
          JSON.stringify(actor)
      )
        await this.character(
          view,
          actor,
          instant,
          duration,
          !!motion?.MotionName,
          !!motion?.FacialName,
          signal,
        );
    }
  }
  private sleep(seconds: number, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Playback canceled', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, seconds * 1000);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  private async command(
    command: Command,
    instant: boolean,
    signal: AbortSignal,
  ) {
    if (!instant && command.delay) await this.sleep(command.delay, signal);
    signal.throwIfAborted();
    await this.apply(
      command.state,
      instant,
      Math.max(
        command.duration,
        ...(command.effects ?? []).map((effect) => effect.Duration ?? 0),
      ),
      command.record,
      signal,
    );
    signal.throwIfAborted();
    this.lastCommand = command.index;
    const sounds =
      command.sounds ??
      (command.action === 7 && command.record ? [command.record] : []);
    for (const record of sounds) {
      // CRI adaptive controls have no public cue mapping. The original full
      // score continues while the exact request remains in state/diagnostics.
      if (record.PlayMode === 5) continue;
      const duration = instant ? 0 : (record.Duration ?? 0);
      if (record.PlayMode === 4) {
        if (this.music) this.fade(this.music, record.Volume ?? 1, duration);
        continue;
      }
      if (record.PlayMode === 3) {
        for (const playing of this.playing)
          if (playing.kind === 'sound' && playing.name === record.Se)
            this.fade(playing, 0, duration, true);
        continue;
      }
      if (record.Bgm)
        await this.play(
          record.Bgm,
          'music',
          record.Volume ?? 1,
          duration,
          signal,
        );
      if (record.Se && !instant)
        await this.play(
          record.Se,
          'sound',
          record.Volume ?? 1,
          duration,
          signal,
          record.PlayMode === 2,
        );
    }
    const effects =
      command.effects ??
      (command.action === 6 && command.record ? [command.record] : []);
    for (const record of effects) {
      if (record.EffectType === 25) this.shakeUntil = 0;
      if (record.EffectType === 26) {
        this.animations.forEach((animation) => animation.cancel());
        this.animations.clear();
      }
      if ([8, 18].includes(record.EffectType ?? -1) && !instant) {
        this.caption.textContent = record.StringVal ?? '';
        this.caption.getAnimations().forEach((a) => a.cancel());
        this.caption.animate(
          [
            { opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0 },
          ],
          { duration: 3000, fill: 'forwards' },
        );
      }
      if (record.EffectType === 5 && !instant)
        this.shakeUntil = performance.now() + (record.Duration ?? 0) * 1000;
      if (record.EffectType === 6 && !instant && !this.reduced) {
        const animation = this.host
          .closest('main')
          ?.querySelector('.dialogue-window')
          ?.animate(
            [
              { transform: 'translateX(-3px)' },
              { transform: 'translateX(3px)' },
            ],
            {
              duration: 90,
              iterations: Math.max(
                1,
                Math.floor(((record.Duration ?? 0) * 1000) / 90),
              ),
            },
          );
        if (animation) {
          this.animations.add(animation);
          animation.onfinish = () => this.animations.delete(animation);
        }
      }
    }
    if (command.wait && !instant && command.duration)
      await this.sleep(command.duration, signal);
  }
  async show(index: number, fast: boolean, seek: boolean) {
    // A package replacement can render once with the old player while its
    // successor loads. Never revive its aborted run or reuse disposed textures.
    if (this.disposed)
      throw new DOMException('Scene player was disposed.', 'AbortError');
    const revision = ++this.revision;
    this.run.abort();
    this.run = new AbortController();
    const signal = this.run.signal;
    await this.ready;
    signal.throwIfAborted();
    const step = this.program.steps[index];
    if (!step) throw new Error('PJSK passage index is invalid.');
    const consecutive =
      this.lastIndex >= 0 && index === this.lastIndex + 1 && !seek;
    const instant =
      fast || seek || (!consecutive && (this.lastIndex >= 0 || index !== 0));
    if (!consecutive || fast) {
      this.tweeners.clear();
      this.shakeUntil = 0;
      this.animations.forEach((animation) => animation.cancel());
      this.animations.clear();
      this.caption.textContent = '';
      this.caption.getAnimations().forEach((a) => a.cancel());
      // Seeking and playback-mode changes cancel transient sounds while the
      // current BGM continues. play() replaces it only if the target differs.
      this.stopSounds(true);
      await this.apply(instant ? step.after : step.before, true);
      await this.play(
        (instant ? step.after : step.before).music,
        'music',
        step.after.musicVolume,
        0,
        signal,
      );
      for (const [name, volume] of Object.entries(
        (instant ? step.after : step.before).loopingSounds ?? {},
      ))
        await this.play(name, 'sound', volume, 0, signal, true);
    }
    if (!instant)
      for (const command of step.commands)
        await this.command(command, false, signal);
    else {
      this.lastCommand = Math.min(step.index, this.program.sourceCommands - 1);
    }
    signal.throwIfAborted();
    if (revision !== this.revision) return;
    this.lastIndex = index;
    const textCommand = [...step.commands]
      .reverse()
      .find((command) => command.action === 1);
    const record = textCommand?.record as Command['record'] & {
      TalkCharacters?: { Character2dId: number }[];
      LipSync?: number;
    };
    this.currentSpeaker =
      record?.LipSync === 1
        ? (record.TalkCharacters?.[0]?.Character2dId ?? 0)
        : 0;
    if (step.kind === 'end') this.stopSounds();
  }
  get diagnostics() {
    return {
      index: this.lastIndex,
      lastCommand: this.lastCommand,
      sourceCommands: this.program.sourceCommands,
      state: this.state,
      models: [...this.models.entries()].map(([costume, view]) => ({
        costume,
        visible: view.model.visible,
        motion: view.motion,
        expression: view.expression,
        x: view.model.x,
        width: view.model.width,
        height: view.model.height,
      })),
      music: this.music?.name ?? null,
      bgmBlockIndex: this.state?.bgmBlockIndex ?? 0,
      bgmControl: this.state?.bgmControl ?? null,
      videoBackground: this.activeVideo
        ? {
            name: this.state?.background,
            currentTime: this.activeVideo.currentTime,
            paused: this.activeVideo.paused,
            loop: this.activeVideo.loop,
            muted: this.activeVideo.muted,
            readyState: this.activeVideo.readyState,
            width: this.activeVideo.videoWidth,
            height: this.activeVideo.videoHeight,
          }
        : null,
      playingSounds: this.playing.size,
      audioState: this.context.state,
      ready: this.models.size === Object.keys(this.program.media.models).length,
      voiceLevel: this.voice?.() ?? 0,
      speaker: this.currentSpeaker,
    };
  }
  dispose() {
    this.disposed = true;
    this.controller.abort();
    this.run.abort();
    this.observer.disconnect();
    this.stopSounds();
    this.context.onstatechange = null;
    this.activeVideo = null;
    for (const video of this.videoBackgrounds.values()) video.pause();
    this.output.disconnect();
    void this.context.close();
    this.tweeners.clear();
    this.animations.forEach((animation) => animation.cancel());
    this.animations.clear();
    for (const view of this.models.values()) {
      view.facial.destroy();
      view.model.destroy({ children: true, texture: true, baseTexture: true });
      view.release();
    }
    this.models.clear();
    this.app.destroy(true, { children: true });
    for (const frame of this.particleFrames) frame.destroy(false);
    for (const texture of new Set(this.textures.values()))
      texture.destroy(true);
    for (const video of this.videoBackgrounds.values()) {
      video.removeAttribute('src');
      video.load();
    }
    this.videoBackgrounds.clear();
    this.imageUrls.forEach((url) => URL.revokeObjectURL(url));
    this.buffers.clear();
  }
}
