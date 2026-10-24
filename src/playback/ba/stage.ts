import { BaOverlays } from './overlays';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  GLTexture,
  ManagedWebGLRenderingContext,
  Physics,
  SceneRenderer,
  Skeleton,
  SkeletonBinary,
  TextureAtlas,
} from '@esotericsoftware/spine-webgl';
import type { BaActor, BaAssets, BaRow, BaState } from './types';
import { baResource } from './resources';
import { resolveBaExpression } from './expressions';
import { BaSpineBackground } from './background-spine';
import { faceBounds, type FaceBounds } from './emotion-layout';
import { canonicalBaScript } from './script';

interface Model {
  skeleton: Skeleton;
  animation: AnimationState;
  atlas: TextureAtlas;
  face: string;
  blink: number;
}
const position = [-0.5, -7 / 24, -1 / 6, 0, 1 / 6, 7 / 24];

export class BaStage {
  private context: ManagedWebGLRenderingContext;
  private renderer: SceneRenderer;
  private canvas = document.createElement('canvas');
  private signalCanvas = document.createElement('canvas');
  private signalContext = this.signalCanvas.getContext('2d');
  private whiteCanvas = document.createElement('canvas');
  private whiteContext = this.whiteCanvas.getContext('2d');
  private background = document.createElement('div');
  private spineBackground?: BaSpineBackground;
  private oldTransform = '';
  private overlay = document.createElement('div');
  private emotions = document.createElement('div');
  private presentation: BaOverlays;
  private textSpeed = 45;
  private models = new Map<string, Model>();
  readonly expressions: Record<string, string[]> = {};
  private expressionWarnings = new Set<string>();
  private emotionFaces: Record<string, FaceBounds> = {};
  private images = new Map<number, string>();
  private imageSizes = new Map<number, { width: number; height: number }>();
  private urls: string[] = [];
  private requests = new AbortController();
  private state?: BaState;
  private exits = new Map<string, { actor: BaActor; time: number }>();
  private disposed = false;
  private frame = 0;
  private clock = 0;
  private changedAt = 0;
  private lastTime = 0;
  private reduced = false;
  private animations: Animation[] = [];
  constructor(
    private host: HTMLDivElement,
    private assets: BaAssets,
  ) {
    this.canvas.className = 'ba-actors';
    this.signalCanvas.className = 'ba-signal';
    this.whiteCanvas.className = 'ba-signal ba-white-silhouettes';
    this.canvas.setAttribute(
      'aria-label',
      'Original Blue Archive animated characters',
    );
    this.background.className = 'ba-background';
    this.overlay.className = 'ba-transition';
    this.emotions.className = 'ba-emotions';
    this.host.replaceChildren(
      this.background,
      this.canvas,
      this.whiteCanvas,
      this.signalCanvas,
      this.emotions,
      this.overlay,
    );
    this.presentation = new BaOverlays(
      this.host,
      this.assets,
      this.requests.signal,
    );
    this.context = new ManagedWebGLRenderingContext(this.canvas, {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    this.renderer = new SceneRenderer(this.canvas, this.context);
  }
  async prepare() {
    await Promise.all([
      this.presentation.prepare(),
      ...Object.entries(this.assets.backgrounds).map(
        async ([id, background]) => {
          if (background.renderer === 'spine') {
            this.spineBackground ??= new BaSpineBackground(
              this.background,
              this.requests.signal,
            );
            await this.spineBackground.prepare(Number(id), background);
            return;
          }
          const response = await baResource(
            background.url,
            this.requests.signal,
          );
          const url = URL.createObjectURL(await response.blob());
          if (this.disposed) {
            URL.revokeObjectURL(url);
            return;
          }
          this.urls.push(url);
          const image = new Image();
          image.src = url;
          await image.decode();
          this.images.set(Number(id), url);
          this.imageSizes.set(Number(id), {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        },
      ),
      ...Object.entries(this.assets.characters).map(async ([name, asset]) => {
        if (asset.invisible) {
          this.expressions[name] = [];
          return;
        }
        const [atlasText, bytes] = await Promise.all([
          baResource(asset.atlas, this.requests.signal).then((r) => r.text()),
          baResource(asset.skeleton, this.requests.signal).then((r) =>
            r.arrayBuffer(),
          ),
        ]);
        const atlas = new TextureAtlas(atlasText);
        try {
          for (const page of atlas.pages) {
            const url = asset.pages.find(
              (url) => url.split('/').at(-1) === page.name,
            );
            if (!url) throw new Error(`Missing original texture: ${page.name}`);
            const response = await baResource(url, this.requests.signal);
            const objectUrl = URL.createObjectURL(await response.blob());
            this.urls.push(objectUrl);
            const image = new Image();
            image.src = objectUrl;
            await image.decode();
            if (this.disposed) throw new Error('Scene disposed.');
            page.setTexture(new GLTexture(this.context, image));
          }
          const data = new SkeletonBinary(
            new AtlasAttachmentLoader(atlas),
          ).readSkeletonData(new Uint8Array(bytes));
          const skeleton = new Skeleton(data);
          if (asset.skin) {
            if (!data.findSkin(asset.skin))
              throw new Error(
                `Original skin unavailable: ${name} ${asset.skin}`,
              );
            skeleton.setSkinByName(asset.skin);
            skeleton.setSlotsToSetupPose();
          }
          this.expressions[name] = data.animations.map(
            (animation) => animation.name,
          );
          const animation = new AnimationState(new AnimationStateData(data));
          animation.data.defaultMix = 0;
          if (data.findAnimation('Idle_01'))
            animation.setAnimation(0, 'Idle_01', true);
          animation.apply(skeleton);
          skeleton.updateWorldTransform(Physics.update);
          this.models.set(name, {
            skeleton,
            animation,
            atlas,
            face: '',
            blink: 5,
          });
        } catch (e) {
          atlas.dispose();
          throw e;
        }
      }),
    ]);
    if (this.disposed) return;
    this.lastTime = performance.now();
    this.draw(this.lastTime);
  }
  configure(reduced: boolean, textSpeed = 45) {
    this.reduced = reduced;
    this.textSpeed = textSpeed;
  }
  show(state: BaState, instant = false) {
    if (instant) this.exits.clear();
    if (!instant && this.state)
      for (const actor of Object.values(this.state.actors)) {
        const next = state.actors[actor.name];
        if (
          actor.visible &&
          next &&
          !next.visible &&
          ['d', 'dl', 'dr', 'falldownL', 'falldownR'].includes(next.action)
        )
          this.exits.set(actor.name, {
            actor: { ...actor, action: next.action },
            time: this.clock,
          });
      }
    this.state = state;
    this.changedAt = this.clock;
    this.overlay.style.backgroundImage =
      this.spineBackground?.diagnostics.active &&
      this.spineBackground.diagnostics.active !== state.background
        ? `url("${this.spineBackground.capture()}")`
        : this.background.style.backgroundImage;
    this.overlay.style.backgroundSize = 'cover';
    this.overlay.style.backgroundPosition = 'center';
    const image = this.images.get(state.background);
    if (
      state.background &&
      !image &&
      this.assets.backgrounds[state.background]?.renderer !== 'spine'
    )
      throw new Error(`Original background unavailable: ${state.background}`);
    this.background.style.backgroundImage = image ? `url("${image}")` : 'none';
    this.spineBackground?.show(state.background);
    this.background.dataset.backgroundId = String(state.background);
    this.oldTransform = getComputedStyle(this.background).transform;
    for (const animation of this.background.getAnimations()) animation.cancel();
    const zoom = Math.max(0.5, Math.min(3, 3000 / state.zoom.size));
    this.background.style.transform = `scale(${zoom}) translate(${-state.zoom.x / 30}%, ${state.zoom.y / 30}%)`;
    this.emotions.replaceChildren();
    for (const actor of Object.values(state.actors).filter((a) => a.visible)) {
      if (this.assets.characters[actor.name]?.invisible) continue;
      const model = this.models.get(actor.name);
      if (!model)
        throw new Error(`Original character unavailable: ${actor.name}`);
      if (
        actor.requestedFace &&
        resolveBaExpression(actor.requestedFace, this.expressions[actor.name])
          .mode === 'hold'
      )
        this.expressionWarnings.add(
          `${this.assets.characters[actor.name].model}: missing expression ${actor.requestedFace}; kept previous expression`,
        );
      if (actor.face !== model.face) {
        const resolution = resolveBaExpression(
          actor.face,
          this.expressions[actor.name],
        );
        if (actor.face && resolution.mode === 'hold') {
          this.expressionWarnings.add(
            `${this.assets.characters[actor.name].model}: missing expression ${actor.face}; kept previous expression`,
          );
          continue;
        }
        if (
          actor.face &&
          !model.skeleton.data.findAnimation(resolution.animation)
        )
          throw new Error(
            `Original expression unavailable: ${actor.name} ${actor.face}`,
          );
        model.animation.clearTrack(2);
        model.animation.clearTrack(1);
        model.skeleton.setToSetupPose();
        if (resolution.animation)
          model.animation.setAnimation(1, resolution.animation, true);
        model.face = actor.face;
      }
    }
    this.presentation.show(state, instant, this.reduced, this.textSpeed);
    this.host.dataset.characters = Object.values(state.actors)
      .filter((a) => a.visible)
      .map((a) => `${this.assets.characters[a.name].model}:${a.face}`)
      .join(',');
  }
  transition(row: BaRow, instant: boolean) {
    if (instant || this.reduced || !row.Transition) return 0;
    const transition = this.assets.transitions[row.Transition];
    if (!transition) return 0;
    for (const animation of this.overlay.getAnimations()) animation.cancel();
    this.overlay.style.clipPath = 'none';
    const duration =
      transition.TransitionIn === 'bgoverlap'
        ? transition.TransitionOutDuration
        : transition.TransitionInDuration;
    if (transition.TransitionIn === 'bgoverlap') {
      this.overlay.style.backgroundColor = 'transparent';
    } else
      this.overlay.style.background = transition.TransitionIn.includes('white')
        ? '#fff'
        : '#000';
    const wipe = /HorSwipe_(LtoR|RtoL|M)_/.exec(
      transition.TransitionInResource ?? '',
    );
    const direction = wipe?.[1] === 'RtoL' ? 'RtoL' : 'LtoR';
    const frames = wipe
      ? [
          { opacity: 1, clipPath: 'inset(0 0 0 0)' },
          {
            opacity: 1,
            clipPath:
              direction === 'LtoR' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)',
          },
        ]
      : [{ opacity: 1 }, { opacity: 0 }];
    const animation = this.overlay.animate(frames, {
      duration: Math.max(1, duration),
      fill: 'forwards',
    });
    this.animations.push(animation);
    return duration;
  }
  fadeOut(row: BaRow, instant: boolean) {
    for (const animation of this.overlay.getAnimations()) animation.cancel();
    this.overlay.style.clipPath = 'none';
    this.overlay.style.opacity = '0';
    const transition = this.assets.transitions[row.Transition];
    if (
      instant ||
      this.reduced ||
      !transition ||
      transition.TransitionOut === 'bgoverlap'
    )
      return 0;
    this.overlay.style.background = transition.TransitionOut.includes('white')
      ? '#fff'
      : '#000';
    const wipe = /HorSwipe_(LtoR|RtoL|M)_/.exec(
      transition.TransitionOutResource ?? '',
    );
    const direction = wipe?.[1] === 'RtoL' ? 'RtoL' : 'LtoR';
    const frames = wipe
      ? [
          {
            opacity: 1,
            clipPath:
              direction === 'LtoR' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)',
          },
          { opacity: 1, clipPath: 'inset(0 0 0 0)' },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    this.animations.push(
      this.overlay.animate(frames, {
        duration: transition.TransitionOutDuration,
        fill: 'forwards',
      }),
    );
    return transition.TransitionOutDuration;
  }
  moveCamera(row: BaRow, instant: boolean) {
    const camera = /#(?:zmc|zmlt);move;[^;]+;[^;]+;(\d+)/.exec(
      canonicalBaScript(row.ScriptKr),
    );
    if (camera && !instant && !this.reduced)
      this.animations.push(
        this.background.animate(
          [
            { transform: this.oldTransform },
            { transform: this.background.style.transform },
          ],
          // show() already sets the destination. A forwards fill would mask
          // later instant/reset commands after this pan has finished.
          { duration: Number(camera[1]) },
        ),
      );
  }
  revealCaptions() {
    this.presentation.reveal();
  }
  private place(model: Model, actor: BaActor, width: number, elapsed: number) {
    const baseScale = (1080 / 550) * 0.34;
    const scale = baseScale * (actor.closeup ? 1.5 : 1);
    model.skeleton.scaleX = scale;
    model.skeleton.scaleY = scale;
    let x = width * (0.5 + position[actor.position]);
    // The source's pivot sits halfway down the skeleton bounds. Keep that
    // pivot fixed when enlarging a close-up instead of scaling from the feet.
    let y = model.skeleton.data.height * (baseScale * 0.51 - scale * 0.5);
    if (!this.reduced && elapsed < 1) {
      if (actor.action === 'hophop')
        y +=
          Math.abs(Math.sin(elapsed * Math.PI * 8)) *
          50 *
          Math.max(0, 1 - elapsed);
      if (actor.action === 'greeting')
        y -= Math.sin(Math.min(1, elapsed / 0.4) * Math.PI) * 50;
      if (actor.action === 'jump')
        y += Math.sin(Math.min(1, elapsed / 0.6) * Math.PI) * 120;
      if (actor.action === 'shake' || actor.action === 'stiff')
        x += Math.sin(elapsed * 70) * 15 * (1 - elapsed);
      if (actor.action === 'al') x += (1 - elapsed) * width;
      if (actor.action === 'ar') x -= (1 - elapsed) * width;
    }
    model.skeleton.x = x;
    model.skeleton.y = y;
    const signal = this.assets.characters[actor.name].signal || actor.signal;
    const light = actor.silhouette ? 0 : actor.highlight ? 1 : 0.72;
    model.skeleton.color.set(
      signal ? 0.88 : light,
      signal ? 0.96 : light,
      signal ? 1 : light,
      signal ? 0.9 : 1,
    );
    if (!this.reduced && elapsed < 0.6) {
      if (actor.action === 'a')
        model.skeleton.color.a *= Math.min(1, elapsed / 0.25);
      if (actor.action === 'd')
        model.skeleton.color.a *= Math.max(0, 1 - elapsed / 0.6);
      if (actor.action === 'dl') model.skeleton.x -= (elapsed / 0.6) * width;
      if (actor.action === 'dr') model.skeleton.x += (elapsed / 0.6) * width;
      if (actor.action.startsWith('falldown'))
        model.skeleton.y -= (300 * elapsed) / 0.6;
    }
  }
  private draw = (time: number) => {
    if (this.disposed) return;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.clock += delta;
    this.spineBackground?.draw(delta, this.reduced);
    const ratio = Math.min(2, devicePixelRatio || 1);
    const cw = Math.max(1, this.host.clientWidth);
    const ch = Math.max(1, this.host.clientHeight);
    if (
      this.canvas.width !== Math.round(cw * ratio) ||
      this.canvas.height !== Math.round(ch * ratio)
    ) {
      this.canvas.width = Math.round(cw * ratio);
      this.canvas.height = Math.round(ch * ratio);
      this.signalCanvas.width = this.canvas.width;
      this.signalCanvas.height = this.canvas.height;
      this.whiteCanvas.width = this.canvas.width;
      this.whiteCanvas.height = this.canvas.height;
    }
    const width = (1080 * cw) / ch;
    this.context.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.renderer.camera.setViewport(width, 1080);
    this.renderer.camera.position.set(width / 2, 540, 0);
    this.renderer.camera.update();
    this.context.gl.clearColor(0, 0, 0, 0);
    this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);
    if (this.state) {
      const actors = Object.values(this.state.actors)
        .filter((a) => a.visible && !this.assets.characters[a.name]?.invisible)
        .sort((a, b) => Math.abs(b.position - 3) - Math.abs(a.position - 3));
      for (const [name, exit] of this.exits) {
        if (this.clock - exit.time > 0.6) this.exits.delete(name);
        else if (!actors.some((a) => a.name === name)) actors.push(exit.actor);
      }
      const drawActor = (actor: BaActor) => {
        const model = this.models.get(actor.name);
        if (!model) return;
        this.place(
          model,
          actor,
          width,
          this.exits.has(actor.name)
            ? this.clock - this.exits.get(actor.name)!.time
            : this.clock - this.changedAt,
        );
        if (
          !this.reduced &&
          actor.face === '01' &&
          this.clock >= model.blink &&
          model.skeleton.data.findAnimation('Eye_Close_01')
        ) {
          model.animation.setAnimation(2, 'Eye_Close_01', false);
          model.animation.addEmptyAnimation(2, 0, 0.2);
          model.blink = this.clock + 5.5;
        }
        model.animation.update(this.reduced ? 0 : delta);
        model.animation.apply(model.skeleton);
        const root = model.skeleton.bones[0];
        const rotation = root.rotation;
        if (actor.action.startsWith('falldown')) {
          const elapsed = this.exits.has(actor.name)
            ? this.clock - this.exits.get(actor.name)!.time
            : 0;
          root.rotation +=
            (actor.action === 'falldownL' ? 90 : -90) *
            Math.min(1, elapsed / 0.6);
        }
        model.skeleton.updateWorldTransform(Physics.update);
        if (actor.emotion) {
          const bounds = faceBounds(model.skeleton);
          const face = {
            left: (bounds.left / width) * cw,
            right: (bounds.right / width) * cw,
            top: (1 - bounds.top / 1080) * ch,
            bottom: (1 - bounds.bottom / 1080) * ch,
          };
          this.emotionFaces[actor.name] = face;
          this.presentation.positionEmotion(actor.name, face);
        }
        this.renderer.drawSkeleton(
          model.skeleton,
          model.atlas.pages[0]?.pma ?? true,
        );
        root.rotation = rotation;
      };
      const signalActors = actors.filter(
        (a) =>
          !a.whiteSilhouette &&
          (this.assets.characters[a.name].signal || a.signal),
      );
      this.whiteContext?.clearRect(
        0,
        0,
        this.whiteCanvas.width,
        this.whiteCanvas.height,
      );
      const whiteActors = actors.filter((a) => a.whiteSilhouette);
      if (whiteActors.length && this.whiteContext) {
        this.renderer.begin();
        for (const actor of whiteActors) drawActor(actor);
        this.renderer.end();
        this.whiteContext.globalCompositeOperation = 'source-over';
        this.whiteContext.drawImage(this.canvas, 0, 0);
        this.whiteContext.globalCompositeOperation = 'source-in';
        this.whiteContext.fillStyle = '#fff';
        this.whiteContext.fillRect(
          0,
          0,
          this.whiteCanvas.width,
          this.whiteCanvas.height,
        );
        this.whiteContext.globalCompositeOperation = 'source-over';
        this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);
      }
      this.signalContext?.clearRect(
        0,
        0,
        this.signalCanvas.width,
        this.signalCanvas.height,
      );
      if (signalActors.length && this.signalContext) {
        this.renderer.begin();
        for (const actor of signalActors) drawActor(actor);
        this.renderer.end();
        this.signalContext.globalCompositeOperation = 'source-over';
        this.signalContext.drawImage(this.canvas, 0, 0);
        this.signalContext.globalCompositeOperation = 'source-atop';
        this.signalContext.fillStyle = 'rgba(20,80,125,.30)';
        // Keep fine projection lines in scene space, independent of display DPI.
        const scenePixel = this.signalCanvas.height / 1080;
        const offset = this.reduced ? 0 : ((this.clock * 12) % 6) * scenePixel;
        for (let y = offset; y < this.signalCanvas.height; y += 6 * scenePixel)
          this.signalContext.fillRect(
            0,
            y,
            this.signalCanvas.width,
            1.5 * scenePixel,
          );
        this.signalContext.globalCompositeOperation = 'source-over';
        this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);
      }
      this.renderer.begin();
      for (const actor of actors)
        if (
          (!actor.whiteSilhouette &&
            !(this.assets.characters[actor.name].signal || actor.signal)) ||
          (!actor.whiteSilhouette && !this.signalContext)
        )
          drawActor(actor);
      this.renderer.end();
      this.canvas.style.transform =
        !this.reduced && this.state.shake && this.clock - this.changedAt < 0.6
          ? `translateX(${Math.sin(this.clock * 80) * 5}px)`
          : '';
    }
    this.frame = requestAnimationFrame(this.draw);
  };
  finish() {
    this.exits.clear();
    this.presentation.finish();
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.overlay.style.opacity = '0';
  }
  get backgroundGeometry() {
    const id = this.state?.background ?? 0;
    return this.imageSizes.get(id) ?? { width: 1920, height: 1080 };
  }
  get diagnostics() {
    return {
      models: this.models.size,
      state: this.state,
      frames: this.clock,
      textures: this.urls.length,
      renderer: 'Spine 4.2',
      expressionWarnings: [...this.expressionWarnings],
      emotionFaces: this.emotionFaces,
      spineBackground: this.spineBackground?.diagnostics,
    };
  }
  dispose() {
    this.disposed = true;
    this.requests.abort();
    cancelAnimationFrame(this.frame);
    this.finish();
    for (const model of this.models.values()) model.atlas.dispose();
    this.models.clear();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.presentation.dispose();
    this.spineBackground?.dispose();
    this.renderer.dispose();
    this.context.dispose();
    this.host.replaceChildren();
  }
}
