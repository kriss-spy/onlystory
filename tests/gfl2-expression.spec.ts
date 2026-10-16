import { test, expect } from '@playwright/test';

test('the real Friday closed-eye expression stays closed through the blink cycle while open expressions can still blink', async ({
  page,
}) => {
  await page.goto('/manage');
  const result = await page.evaluate(async () => {
    const stageModule = '/src/playback/gfl2/event-stage.ts';
    const stateModule = '/src/playback/gfl2/event-state.ts';
    const { EventStage } = await import(stageModule);
    const { buildTimeline } = await import(stateModule);
    const manifest = await (
      await fetch('/src/generated/gfl2-ilion-scenes.json')
    ).json();
    const program = await (
      await fetch(manifest.sections['gfl2-ilion-34401'].url)
    ).json();
    const index = program.steps.findIndex(
      (step: { id: string }) => step.id === 'M22003:211',
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px';
    document.body.append(host);
    const errors: string[] = [];
    const stage = new EventStage(host, program, (message: string) =>
      errors.push(message),
    );
    const random = Math.random;
    try {
      stage.configure('male', true);
      stage.show(buildTimeline(program)[index], true);
      const deadline = performance.now() + 10000;
      while (
        (!stage.diagnostics.models.length ||
          !stage.diagnostics.models[0].patterns.length) &&
        performance.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      stage.app.ticker.stop();
      const view = [...stage.views.values()].find(
        (view: { layer: { kind: string } }) => view.layer.kind === 'character',
      );
      const model = view.visual;
      const core = model.internalModel.coreModel;
      let samples: number[][] = [];
      model.internalModel.on('beforeModelUpdate', () =>
        samples.push(
          ['ParamEyeLOpen', 'ParamEyeROpen'].map((id) =>
            core.getParameterValueById(id),
          ),
        ),
      );
      Math.random = () => 0.5;
      let clock = model.elapsedTime;
      const tick = (dt: number) => {
        clock += dt;
        model.internalModel.update(dt, clock);
      };
      const sample = () => {
        samples = [];
        for (let i = 0; i < 420; i++) tick(1000 / 60);
        return {
          min: Math.min(...samples.flat()),
          max: Math.max(...samples.flat()),
        };
      };
      tick(1000);
      const closed = sample();
      await model.expression(
        program.characters['星期五闭眼'].variants.Serious.expressionIndex,
      );
      tick(1000);
      const open = sample();
      return { errors, closed, open };
    } finally {
      Math.random = random;
      stage.dispose();
      host.remove();
    }
  });
  expect(result.errors).toEqual([]);
  expect(result.closed.max).toBeLessThan(0.01);
  expect(result.open.max).toBeGreaterThan(0.9);
  expect(result.open.min).toBeLessThan(0.1);
});
