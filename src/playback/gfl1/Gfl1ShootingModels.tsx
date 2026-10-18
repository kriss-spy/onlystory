import { useEffect, useRef, useState } from 'react';
import { Application, Ticker } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import { loadLive2D, localModel } from '../gfl2/resources';
import type { Gfl1Interaction } from './story';

export function Gfl1ShootingModels({
  interaction,
  fired,
  reducedMotion,
  onReady,
}: {
  interaction: Extract<Gfl1Interaction, { kind: 'shoot' }>;
  fired: number;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const models = useRef<{ target: Live2DModel; gun: Live2DModel } | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState('');
  const readyCallback = useRef(onReady);
  const reduced = useRef(reducedMotion);
  readyCallback.current = onReady;
  reduced.current = reducedMotion;
  useEffect(() => {
    if (!root.current || !interaction.models) return;
    const host = root.current;
    const controller = new AbortController();
    const app = new Application({
      backgroundAlpha: 0,
      antialias: true,
      resizeTo: host,
    });
    host.appendChild(app.view as HTMLCanvasElement);
    const releases: (() => void)[] = [];
    const created: Live2DModel[] = [];
    const dimensions = new Map<
      Live2DModel,
      { width: number; height: number }
    >();
    const resize = () => {
      app.renderer.resize(host.clientWidth, host.clientHeight);
      for (const model of created) {
        const size = dimensions.get(model)!;
        model.scale.set(
          Math.min(
            host.clientWidth / size.width,
            host.clientHeight / size.height,
          ),
        );
        model.position.set(host.clientWidth / 2, host.clientHeight / 2);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    void (async () => {
      const { Live2DModel, Cubism4ModelSettings, MotionPreloadStrategy } =
        await loadLive2D();
      Live2DModel.registerTicker(Ticker);
      const loadedModels: Partial<NonNullable<typeof models.current>> = {};
      for (const key of ['target', 'gun'] as const) {
        const source = await localModel(
          interaction.models![key].modelUrl,
          controller.signal,
        );
        releases.push(source.release);
        const settings = new Cubism4ModelSettings(source.settings);
        settings.resolveURL = (path) =>
          path.startsWith('blob:')
            ? path
            : new URL(path, source.settings.url).href;
        const model = await Live2DModel.from(settings, {
          autoInteract: false,
          autoUpdate: !reduced.current,
          idleMotionGroup: '__manual__',
          motionPreload: MotionPreloadStrategy.ALL,
        });
        if (controller.signal.aborted) {
          model.destroy({ children: true, texture: true, baseTexture: true });
          return;
        }
        model.anchor.set(0.5);
        dimensions.set(model, { width: model.width, height: model.height });
        created.push(model);
        app.stage.addChild(model);
        loadedModels[key] = model;
      }
      models.current = loadedModels as NonNullable<typeof models.current>;
      resize();
      setLoaded(true);
      readyCallback.current();
    })().catch((error) => {
      if (!controller.signal.aborted) {
        setProblem(String(error.message));
        readyCallback.current();
      }
    });
    return () => {
      controller.abort();
      models.current = undefined;
      observer.disconnect();
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      releases.forEach((release) => release());
    };
  }, [interaction.models]);
  useEffect(() => {
    if (!models.current) return;
    for (const model of Object.values(models.current))
      model.autoUpdate = !reducedMotion;
  }, [loaded, reducedMotion]);
  useEffect(() => {
    if (!loaded || !models.current || !interaction.models) return;
    const play = (key: 'target' | 'gun', code: number) => {
      const model = models.current?.[key];
      const motion = interaction.models![key].motions[String(code)];
      if (model && motion) void model.motion(motion.group, motion.index, 3);
    };
    if (fired) {
      play('target', interaction.motions.shoot);
      play('gun', interaction.motions.gunShoot);
    } else if (!reducedMotion) {
      play('target', interaction.motions.wait);
      play('gun', interaction.motions.gunWait);
    }
  }, [fired, loaded, interaction, reducedMotion]);
  return (
    <div
      className="gfl1-shoot-models"
      ref={root}
      data-testid="gfl1-shoot-models"
      data-loaded={loaded}
    >
      {problem ? (
        <p className="gfl1-source-note" role="status">
          Original scene model unavailable: {problem}
        </p>
      ) : null}
    </div>
  );
}
