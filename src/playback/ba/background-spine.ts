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
import type { BaSpineBackgroundAsset } from './types';
import { baResource } from './resources';

interface Background {
  asset: BaSpineBackgroundAsset;
  atlas: TextureAtlas;
  skeleton: Skeleton;
  animation: AnimationState;
}

/** Native Spine backgrounds remain animated behind the scenario character layer. */
export class BaSpineBackground {
  private canvas = document.createElement('canvas');
  private context: ManagedWebGLRenderingContext;
  private renderer: SceneRenderer;
  private models = new Map<number, Background>();
  private active = 0;
  private urls: string[] = [];
  private disposed = false;
  private frames = 0;
  constructor(
    private host: HTMLElement,
    private signal: AbortSignal,
  ) {
    this.canvas.className = 'ba-spine-background';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'none',
    });
    host.append(this.canvas);
    this.context = new ManagedWebGLRenderingContext(this.canvas, {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer = new SceneRenderer(this.canvas, this.context);
  }
  async prepare(id: number, asset: BaSpineBackgroundAsset) {
    const [text, bytes] = await Promise.all([
      baResource(asset.atlas, this.signal).then((response) => response.text()),
      baResource(asset.skeleton, this.signal).then((response) =>
        response.arrayBuffer(),
      ),
    ]);
    const atlas = new TextureAtlas(text);
    try {
      for (const page of atlas.pages) {
        const path = asset.pages.find(
          (url) => url.split('/').at(-1) === page.name,
        );
        if (!path)
          throw new Error(
            `Missing animated background texture: ${asset.name} ${page.name}`,
          );
        const url = URL.createObjectURL(
          await (await baResource(path, this.signal)).blob(),
        );
        this.urls.push(url);
        const image = new Image();
        image.src = url;
        await image.decode();
        if (this.disposed) throw new Error('Animated background disposed.');
        page.setTexture(new GLTexture(this.context, image));
      }
      const data = new SkeletonBinary(
        new AtlasAttachmentLoader(atlas),
      ).readSkeletonData(new Uint8Array(bytes));
      if (!data.findAnimation(asset.animation))
        throw new Error(
          `Original background animation unavailable: ${asset.name} ${asset.animation}`,
        );
      const skeleton = new Skeleton(data);
      const animation = new AnimationState(new AnimationStateData(data));
      animation.setAnimation(0, asset.animation, true);
      animation.apply(skeleton);
      this.models.set(id, { asset, atlas, skeleton, animation });
    } catch (error) {
      atlas.dispose();
      throw error;
    }
  }
  show(id: number) {
    this.canvas.style.display = this.models.has(id) ? 'block' : 'none';
    this.active = this.models.has(id) ? id : 0;
  }
  capture() {
    return this.active ? this.canvas.toDataURL('image/png') : '';
  }
  draw(delta: number, reduced: boolean) {
    const model = this.models.get(this.active);
    if (!model || this.disposed) return;
    const width = Math.max(1, this.host.clientWidth),
      height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(2, devicePixelRatio || 1);
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const viewportWidth = (1080 * width) / height;
    this.context.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.renderer.camera.setViewport(viewportWidth, 1080);
    this.renderer.camera.position.set(viewportWidth / 2, 540, 0);
    this.renderer.camera.update();
    const scale =
      Math.max(
        viewportWidth / model.skeleton.data.width,
        1080 / model.skeleton.data.height,
      ) *
      1.1 *
      (model.asset.scale ?? 1);
    model.skeleton.scaleX = model.skeleton.scaleY = scale;
    model.skeleton.x = viewportWidth / 2 + (model.asset.x ?? 0) * scale;
    model.skeleton.y = (model.asset.y ?? 0) * scale;
    model.animation.update(reduced ? 0 : delta);
    model.animation.apply(model.skeleton);
    model.skeleton.update(reduced ? 0 : delta);
    model.skeleton.updateWorldTransform(Physics.update);
    this.context.gl.clearColor(0, 0, 0, 0);
    this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);
    this.renderer.begin();
    this.renderer.drawSkeleton(
      model.skeleton,
      model.atlas.pages[0]?.pma ?? true,
    );
    this.renderer.end();
    this.frames++;
  }
  get diagnostics() {
    return {
      active: this.active,
      models: this.models.size,
      frames: this.frames,
    };
  }
  dispose() {
    this.disposed = true;
    for (const model of this.models.values()) model.atlas.dispose();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.models.clear();
    this.renderer.dispose();
    this.context.dispose();
    this.canvas.remove();
  }
}
