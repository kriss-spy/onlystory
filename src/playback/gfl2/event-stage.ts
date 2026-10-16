import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  Ticker,
  filters,
} from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import type {
  CharacterAsset,
  EventProgram,
  SceneState,
  VisualLayer,
} from './event-types';
import { cachedResponse, loadLive2D, localModel } from './resources';
import { ShadowFilter } from './shadow-filter';
import {
  HologramFilter,
  loadHologramTextures,
  type HologramTextures,
} from './hologram-filter';
import { isHologramEffect } from './effect-assets';
import { applyOriginalBlinkBlend } from './eye-blink';

interface View {
  root: Container;
  visual: Sprite | Live2DModel;
  layer: VisualLayer;
  url: string;
  release: () => void;
  timers: ReturnType<typeof setTimeout>[];
  expressions: string[];
  expressionRequest: number;
  serial: number;
  hologram?: {
    name: string;
    controller: AbortController;
    filter?: HologramFilter;
    textures?: HologramTextures;
    start: number;
    row?: number;
  };
  motion?: {
    type: string;
    start: number;
    duration: number;
    repeat: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    toX: number;
    toY: number;
    toSx: number;
    toSy: number;
    amountX: number;
    amountY: number;
  };
}
const number = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export class EventStage {
  private app: Application;
  private world = new Container();
  private views = new Map<string, View>();
  private pending = new Map<string, AbortController>();
  private wanted = new Set<string>();
  private observer: ResizeObserver;
  private animations = new Set<{
    view: View;
    from: number;
    to: number;
    start: number;
    duration: number;
    done?: () => void;
  }>();
  private disposed = false;
  private serial = 0;
  private state: SceneState | null = null;
  private instant = true;
  private variant: 'male' | 'female' = 'male';
  private reduced = false;
  private failures = new Set<string>();

  constructor(
    private host: HTMLElement,
    private program: EventProgram,
    private report: (message: string) => void,
  ) {
    this.app = new Application({
      backgroundColor: 0x000000,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(devicePixelRatio || 1, 2),
    });
    this.app.view.setAttribute('aria-label', 'Original GFL2 scene');
    this.app.view.setAttribute('role', 'img');
    host.append(this.app.view as HTMLCanvasElement);
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.app.ticker.add(() => this.tick());
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth),
      height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / 1280, height / 720);
    const zoom = this.state?.zoom;
    this.world.scale.set(scale * (zoom?.scale ?? 1));
    this.world.position.set(
      width / 2 - (zoom?.x ?? 0) * scale,
      height / 2 + (zoom?.y ?? 0) * scale,
    );
    for (const view of this.views.values()) this.updateEffectFrame(view);
    this.app.render();
  }

  configure(variant: 'male' | 'female', reduced: boolean) {
    const changed = variant !== this.variant;
    this.variant = variant;
    this.reduced = reduced;
    for (const view of this.views.values())
      // Live2D's setter adds another ticker callback even when already enabled.
      if ('autoUpdate' in view.visual && view.visual.autoUpdate !== !reduced)
        view.visual.autoUpdate = !reduced;
    if (changed && this.state) {
      for (const layer of this.state.layers)
        if (layer.kind === 'character') {
          this.pending.get(layer.id)?.abort();
          this.pending.delete(layer.id);
          this.remove(layer.id);
        }
      this.show(this.state, true);
    }
  }

  show(state: SceneState, instant: boolean) {
    this.state = state;
    this.instant = instant || this.reduced;
    this.wanted = new Set(
      state.layers
        .filter((layer) => layer.kind !== 'particle')
        .map((layer) => layer.id),
    );
    for (const [id, controller] of this.pending)
      if (!this.wanted.has(id)) {
        controller.abort();
        this.pending.delete(id);
      }
    for (const [id, view] of this.views)
      if (!this.wanted.has(id)) {
        view.timers.forEach(clearTimeout);
        view.timers = [];
        if (
          !this.instant &&
          [...this.animations].some(
            (animation) => animation.view === view && animation.to === 0,
          )
        )
          continue;
        const removal = state.removals?.find((removal) => removal.id === id);
        this.fade(
          view,
          0,
          this.instant ? 0 : (removal?.fade ?? 0.2),
          this.instant ? 0 : (removal?.delay ?? 0),
          () => {
            if (!this.wanted.has(id)) this.remove(id);
          },
        );
      }
    for (const layer of state.layers) {
      if (layer.kind === 'particle') continue;
      const asset = this.asset(layer);
      if (asset && 'kind' in asset && asset.kind === 'sound-only') continue;
      const url =
        asset?.url ??
        ('color' in (asset ?? {})
          ? String((asset as { color: string }).color)
          : '');
      const old = this.views.get(layer.id);
      if (old && old.url !== url) this.remove(layer.id);
      const view = this.views.get(layer.id);
      if (view) this.apply(view, layer, this.instant);
      else if (!this.pending.has(layer.id)) void this.create(layer, url);
    }
    this.resize();
  }

  private asset(layer: VisualLayer) {
    if (layer.kind !== 'character')
      return this.program.backgrounds[layer.asset ?? layer.id];
    const base = this.program.characters[layer.asset ?? layer.id];
    return this.variant === 'female' && base?.female
      ? { ...base, ...base.female, variants: base.variants }
      : base;
  }

  private async create(layer: VisualLayer, url: string) {
    const controller = new AbortController();
    this.pending.set(layer.id, controller);
    let release = () => {};
    let visual: Sprite | Live2DModel | undefined;
    try {
      const asset = this.asset(layer);
      if (!asset)
        throw new Error(`Original ${layer.kind} unavailable: ${layer.id}`);
      if (layer.kind === 'character') {
        if (!asset.url) return;
        const { Live2DModel, MotionPreloadStrategy, Cubism4ModelSettings } =
          await loadLive2D();
        Live2DModel.registerTicker(Ticker);
        const model = await localModel(asset.url, controller.signal);
        release = model.release;
        const settings = new Cubism4ModelSettings(model.settings);
        // The library's legacy URL resolver does not understand blob: URLs.
        settings.resolveURL = (path) =>
          path.startsWith('blob:')
            ? path
            : new URL(path, model.settings.url).href;
        visual = await Live2DModel.from(settings, {
          autoInteract: false,
          autoUpdate: !this.reduced,
          motionPreload: MotionPreloadStrategy.NONE,
        });
        applyOriginalBlinkBlend(
          (visual as Live2DModel)
            .internalModel as import('pixi-live2d-display/cubism4').Cubism4InternalModel,
        );
      } else if (asset.url) {
        const object = URL.createObjectURL(
          await (await cachedResponse(asset.url, controller.signal)).blob(),
        );
        release = () => URL.revokeObjectURL(object);
        visual = new Sprite(await Texture.fromURL(object));
      } else visual = new Sprite(Texture.WHITE);
      if (
        this.disposed ||
        controller.signal.aborted ||
        !this.wanted.has(layer.id)
      ) {
        visual.destroy({ children: true, texture: true, baseTexture: true });
        release();
        return;
      }
      visual.anchor.set(0.5);
      const root = new Container();
      root.addChild(visual);
      if (layer.kind === 'character') {
        const crop = new Graphics();
        const variant =
          (asset as CharacterAsset).variants[layer.pattern[0]?.name] ??
          Object.values((asset as CharacterAsset).variants)[0];
        const rect =
          typeof variant?.renderRect === 'string'
            ? variant.renderRect.split(',').map(Number)
            : (variant?.renderRect ?? [0, 0, 800, 800]);
        crop
          .beginFill(0xffffff)
          .drawRect(-rect[2] / 2, -rect[3] / 2, rect[2], rect[3])
          .endFill();
        visual.position.set(-rect[0], rect[1]);
        root.addChild(crop);
        visual.mask = crop;
      }
      const view: View = {
        root,
        visual,
        layer,
        url,
        release,
        timers: [],
        expressions: [],
        expressionRequest: 0,
        serial: ++this.serial,
      };
      this.views.set(layer.id, view);
      this.world.addChild(root);
      const current = this.state?.layers.find((item) => item.id === layer.id);
      if (current) this.apply(view, current, this.instant, true);
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.failures.has(message)) {
          this.failures.add(message);
          this.report(message);
        }
      }
      visual?.destroy({ children: true, texture: true, baseTexture: true });
      release();
    } finally {
      if (this.pending.get(layer.id) === controller)
        this.pending.delete(layer.id);
    }
  }

  private apply(
    view: View,
    layer: VisualLayer,
    instant: boolean,
    created = false,
  ) {
    const previous = view.layer;
    view.layer = layer;
    const asset = this.asset(layer)!;
    const preset = this.program.layers[layer.layer] ?? { x: 0, y: 0, order: 0 };
    let sourceX = 0,
      sourceY = 0,
      sx = 1,
      sy = 1;
    if (layer.kind === 'character') {
      const character = asset as CharacterAsset;
      const variant =
        character.variants[layer.pattern[0]?.name] ??
        Object.values(character.variants)[0];
      sourceX = variant?.sourceX ?? 0;
      sourceY = variant?.sourceY ?? 0;
      const model = view.visual as Live2DModel;
      const core = model.internalModel as typeof model.internalModel & {
        pixelsPerUnit: number;
      };
      sx =
        ((character.prefabScale?.x ?? 1300) / core.pixelsPerUnit) *
        (variant?.sourceScale ?? 0.29);
      sy =
        ((character.prefabScale?.y ?? 1300) / core.pixelsPerUnit) *
        (variant?.sourceScale ?? 0.29);
      if (
        created ||
        previous.pattern !== layer.pattern ||
        previous.sourceRow !== layer.sourceRow ||
        instant
      ) {
        view.timers.forEach(clearTimeout);
        view.timers = [];
        const patterns = instant ? layer.pattern.slice(-1) : layer.pattern;
        for (const pattern of patterns) {
          const run = () => {
            if (this.disposed || !this.wanted.has(layer.id)) return;
            const index = character.variants[pattern.name]?.expressionIndex;
            if (index !== undefined) {
              const request = ++view.expressionRequest;
              view.expressions = [];
              void model
                .expression(index)
                .then(() => {
                  if (!model.destroyed && request === view.expressionRequest) {
                    view.expressions = [pattern.name];
                    if (this.reduced) model.update(1000);
                    this.app.render();
                  }
                })
                .catch((error) => this.report(String(error)));
            }
          };
          if (instant || !pattern.at) run();
          else view.timers.push(setTimeout(run, pattern.at * 1000));
        }
      }
    } else {
      const image = asset as import('./event-types').GraphicAsset;
      sourceX = image.sourceX ?? 0;
      sourceY = image.sourceY ?? 0;
      if (!image.url) {
        view.visual.width = 1280;
        view.visual.height = 720;
        (view.visual as Sprite).tint = Number.parseInt(
          (image.color ?? '#000000').slice(1),
          16,
        );
      } else sx = sy = image.sourceScale ?? 1;
    }
    const from = {
      x: view.root.x,
      y: view.root.y,
      sx: view.visual.scale.x,
      sy: view.visual.scale.y,
    };
    view.root.position.set(
      preset.x + sourceX + layer.x,
      -(preset.y + sourceY + layer.y),
    );
    view.root.zIndex = layer.order * 1000 + view.serial;
    view.root.rotation = (-layer.rotation * Math.PI) / 180;
    if (layer.kind === 'character' || asset.url)
      view.visual.scale.set(sx * layer.scaleX, sy * layer.scaleY);
    if (instant || !layer.tween) view.motion = undefined;
    const tween = layer.tween;
    if (
      tween &&
      !this.reduced &&
      !instant &&
      (created ||
        tween.sourceRow !== previous.tween?.sourceRow ||
        (!view.motion && tween.loop === 0))
    ) {
      const args = tween.args;
      const position = !created
        ? from
        : {
            x: view.root.x,
            y: view.root.y,
            sx: view.visual.scale.x,
            sy: view.visual.scale.y,
          };
      view.motion = {
        type: tween.type,
        start:
          performance.now() + (number(args.start) + number(args.delay)) * 1000,
        duration: Math.max(0.001, number(args.time, 1)) * 1000,
        repeat: tween.loop || Infinity,
        x: position.x,
        y: position.y,
        sx: position.sx,
        sy: position.sy,
        toX: view.root.x,
        toY: view.root.y,
        toSx: view.visual.scale.x,
        toSy: view.visual.scale.y,
        amountX: number(args.x),
        amountY: number(args.y),
      };
      if (tween.type === 'ScaleFrom') {
        view.motion.sx = number(args.x, 1) * sx;
        view.motion.sy = number(args.y, 1) * sy;
      }
      if (tween.type === 'MoveTo')
        view.root.position.set(view.motion.x, view.motion.y);
      if (tween.type === 'ScaleTo' || tween.type === 'ScaleFrom')
        view.visual.scale.set(view.motion.sx, view.motion.sy);
    }
    const matrix = new filters.ColorMatrixFilter();
    // Pixi filters default to 1× even when the scene canvas uses a denser
    // backing buffer. Keep intermediate textures at the same resolution so
    // tinting does not downsample the original character art.
    matrix.resolution = this.app.renderer.resolution;
    matrix.brightness(Math.max(0, layer.shaders?._Brightness ?? 1), false);
    const color = layer.color.replace('#', '');
    if (/^[0-9a-f]{6}$/i.test(color)) {
      matrix.matrix[0] *= parseInt(color.slice(0, 2), 16) / 255;
      matrix.matrix[6] *= parseInt(color.slice(2, 4), 16) / 255;
      matrix.matrix[12] *= parseInt(color.slice(4, 6), 16) / 255;
    }
    const effect =
      layer.effect && isHologramEffect(layer.effect) ? layer.effect : undefined;
    if (view.hologram?.name !== effect) {
      this.clearHologram(view);
      if (effect) {
        const hologram = {
          name: effect,
          controller: new AbortController(),
          start:
            performance.now() + (instant ? 0 : (layer.effectDelay ?? 0)) * 1000,
          row: layer.effectRow,
        } as NonNullable<View['hologram']>;
        view.hologram = hologram;
        void loadHologramTextures(effect, hologram.controller.signal)
          .then((textures) => {
            if (this.disposed || view.hologram !== hologram) {
              textures.release();
              return;
            }
            hologram.textures = textures;
            hologram.filter = new HologramFilter(
              effect,
              textures,
              this.app.renderer.resolution,
            );
            this.apply(view, view.layer, this.instant);
          })
          .catch((error) => {
            if (!hologram.controller.signal.aborted && !this.disposed)
              this.report(`Hologram unavailable: ${String(error)}`);
          });
      }
    }
    if (view.hologram && (instant || view.hologram.row !== layer.effectRow)) {
      view.hologram.row = layer.effectRow;
      view.hologram.start =
        performance.now() + (instant ? 0 : (layer.effectDelay ?? 0)) * 1000;
    }
    view.root.filters?.forEach((filter) => {
      if (filter !== view.hologram?.filter) filter.destroy();
    });
    view.root.filters = [matrix];
    if (view.hologram?.filter) view.root.filters.push(view.hologram.filter);
    else if (layer.darkness > 0) {
      const shadow = new ShadowFilter(this.app.renderer.resolution);
      const scale = Math.min(
        this.host.clientWidth / 1280,
        this.host.clientHeight / 720,
      );
      shadow.setShadow(
        layer.darkness,
        layer.shaders?._MaskHeight ?? layer.maskHeight,
        (this.host.clientHeight - 720 * scale) / 2,
        720 * scale,
      );
      view.root.filters.push(shadow);
    }
    if ((layer.shaders?._Radius ?? 0) > 0)
      view.root.filters.push(
        new filters.BlurFilter(
          Math.min(20, layer.shaders!._Radius),
          undefined,
          this.app.renderer.resolution,
        ),
      );
    this.updateEffectFrame(view);
    if (created) view.root.alpha = instant ? layer.alpha : 0;
    if (
      created ||
      instant ||
      previous.alpha !== layer.alpha ||
      previous.sourceRow !== layer.sourceRow
    )
      this.fade(
        view,
        layer.alpha,
        instant ? 0 : layer.fade,
        instant ? 0 : layer.delay,
      );
    this.app.render();
  }

  private clearHologram(view: View) {
    const hologram = view.hologram;
    if (!hologram) return;
    view.hologram = undefined;
    hologram.controller.abort();
    view.root.filters =
      view.root.filters?.filter((filter) => filter !== hologram.filter) ?? null;
    hologram.filter?.destroy();
    hologram.textures?.release();
  }

  private updateEffectFrame(view: View) {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    const sceneHeight = 720 * Math.min(width / 1280, height / 720);
    for (const filter of view.root.filters ?? []) {
      if (filter instanceof ShadowFilter || filter instanceof HologramFilter)
        filter.setShadow(
          view.layer.darkness,
          view.layer.shaders?._MaskHeight ?? view.layer.maskHeight,
          (height - sceneHeight) / 2,
          sceneHeight,
        );
    }
    const hologram = view.hologram;
    if (hologram?.filter) {
      const bounds =
        view.visual.mask instanceof Graphics
          ? view.visual.mask.getBounds()
          : view.root.getBounds();
      hologram.filter.setActorFrame(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
      );
      hologram.filter.uniforms.uHoloAlpha =
        performance.now() >= hologram.start ? 1 : 0;
      hologram.filter.update(this.reduced ? 0 : performance.now() / 1000);
    }
  }

  private fade(
    view: View,
    to: number,
    duration: number,
    delay: number,
    done?: () => void,
  ) {
    for (const animation of this.animations)
      if (animation.view === view) this.animations.delete(animation);
    if (!duration && !delay) {
      view.root.alpha = to;
      done?.();
      this.app.render();
      return;
    }
    this.animations.add({
      view,
      from: view.root.alpha,
      to,
      start: performance.now() + delay * 1000,
      duration: duration * 1000,
      done,
    });
  }
  private tick() {
    const now = performance.now();
    for (const view of this.views.values()) {
      this.updateEffectFrame(view);
      const motion = view.motion;
      if (!motion || now < motion.start) continue;
      const elapsed = (now - motion.start) / motion.duration;
      const fraction = elapsed >= motion.repeat ? 1 : elapsed % 1;
      const eased = fraction * fraction * (3 - 2 * fraction);
      if (motion.type === 'MoveTo')
        view.root.position.set(
          motion.x + (motion.toX - motion.x) * eased,
          motion.y + (motion.toY - motion.y) * eased,
        );
      else if (motion.type === 'ScaleTo' || motion.type === 'ScaleFrom')
        view.visual.scale.set(
          motion.sx + (motion.toSx - motion.sx) * eased,
          motion.sy + (motion.toSy - motion.sy) * eased,
        );
      else if (
        motion.type === 'PunchPosition' ||
        motion.type === 'ShakePosition'
      ) {
        const gain =
          Math.sin(fraction * Math.PI * 8) *
          (motion.type === 'PunchPosition' ? 1 - fraction : 1);
        view.root.position.set(
          motion.toX + motion.amountX * gain,
          motion.toY - motion.amountY * gain,
        );
      }
      if (elapsed >= motion.repeat) {
        view.motion = undefined;
        view.root.position.set(motion.toX, motion.toY);
        view.visual.scale.set(motion.toSx, motion.toSy);
      }
    }
    for (const animation of this.animations) {
      if (now < animation.start) continue;
      const fraction = animation.duration
        ? Math.min(1, (now - animation.start) / animation.duration)
        : 1;
      animation.view.root.alpha =
        animation.from + (animation.to - animation.from) * fraction;
      if (fraction === 1) {
        this.animations.delete(animation);
        animation.done?.();
      }
    }
  }
  private remove(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    this.clearHologram(view);
    this.views.delete(id);
    view.timers.forEach(clearTimeout);
    for (const animation of this.animations)
      if (animation.view === view) this.animations.delete(animation);
    view.root.removeChild(view.visual);
    const ownsTexture =
      !(view.visual instanceof Sprite) || view.visual.texture !== Texture.WHITE;
    view.visual.destroy({
      children: true,
      texture: ownsTexture,
      baseTexture: ownsTexture,
    });
    view.root.filters?.forEach((filter) => filter.destroy());
    view.root.destroy({ children: true });
    view.release();
  }
  get diagnostics() {
    return {
      layers:
        this.state?.layers
          .filter((layer) => layer.kind !== 'particle')
          .map((layer) => layer.id) ?? [],
      loaded: [...this.views.keys()],
      pending: [...this.pending.keys()],
      graphics: [...this.views.values()]
        .filter((view) => ['background', 'sprite'].includes(view.layer.kind))
        .map((view) => ({
          id: view.layer.id,
          url: view.url,
          alpha: view.root.worldAlpha,
          visible: view.root.worldVisible,
          width: view.visual.width,
          height: view.visual.height,
        })),
      models: [...this.views.values()]
        .filter((view) => view.layer.kind === 'character')
        .map((view) => ({
          id: view.layer.id,
          url: view.url,
          patterns: view.expressions,
          x: view.root.x,
          y: view.root.y,
          width: view.visual.width,
          height: view.visual.height,
          alpha: view.root.alpha,
          animationTime: (view.visual as Live2DModel).elapsedTime,
          hologram: view.hologram?.filter ? view.hologram.name : undefined,
        })),
      failures: [...this.failures],
    };
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    for (const controller of this.pending.values()) controller.abort();
    for (const id of this.views.keys()) this.remove(id);
    this.app.destroy(true, { children: true });
  }
}
