import { test, expect } from '@playwright/test';

const reader = '/read/gfl2/gfl2-cn-4028-32990?line=M15033%3A64';

test('reconfiguring the real Harwell scene keeps one model update per animation frame', async ({
  page,
}) => {
  await page.goto('/manage');
  const result = await page.evaluate(async () => {
    const stageModule = '/src/playback/gfl2/event-stage.ts';
    const stateModule = '/src/playback/gfl2/event-state.ts';
    const { EventStage } = await import(stageModule);
    const { buildTimeline } = await import(stateModule);
    const program = await (
      await fetch('/private/gfl2-cn-4028/scenes/gfl2-cn-4028-32990.json')
    ).json();
    const timeline = buildTimeline(program);
    const index = program.steps.findIndex(
      (s: { id: string }) => s.id === 'M15033:64',
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px';
    document.body.append(host);
    const errors: string[] = [];
    const stage = new EventStage(host, program, (message: string) =>
      errors.push(message),
    );
    const Ticker = stage.app.ticker.constructor;
    try {
      stage.configure('male', false);
      stage.show(timeline[index], true);
      const deadline = performance.now() + 10000;
      while (
        !stage.diagnostics.models.some(
          (m: { id: string }) => m.id === '哈维尔',
        ) &&
        performance.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      const view = [...stage.views.values()].find(
        (v: { layer: { id: string } }) => v.layer.id === '哈维尔',
      );
      const model = view.visual;
      stage.app.ticker.stop();
      Ticker.shared.stop();
      Ticker.shared.autoStart = false;
      let now = Ticker.shared.lastTime;
      const frame = () => {
        const before = model.elapsedTime;
        now += 1000 / 60;
        Ticker.shared.update(now);
        return model.elapsedTime - before;
      };
      const initial = frame();
      for (let i = 0; i < 20; i++) {
        stage.configure('male', false);
      }
      const afterSeeking = frame();
      stage.configure('male', true);
      const paused = frame();
      for (let i = 0; i < 20; i++) stage.configure('male', false);
      const resumed = frame();
      return { initial, afterSeeking, paused, resumed, errors };
    } finally {
      stage.dispose();
      Ticker.shared.autoStart = true;
      Ticker.shared.start();
      host.remove();
    }
  });
  expect(result.initial).toBeGreaterThan(0);
  expect(result.afterSeeking).toBeCloseTo(result.initial, 3);
  expect(result.paused).toBe(0);
  expect(result.resumed).toBeCloseTo(result.initial, 3);
  expect(result.errors).toEqual([]);
});

test('dragging and fast-forwarding the reported reader do not accelerate the character clock', async ({
  page,
}) => {
  await page.goto(reader);
  const host = page.getByTestId('native-layers');
  await expect
    .poll(
      () =>
        host.evaluate((el) =>
          (el as any).playbackDiagnostics?.models.some(
            (m: any) => m.id === '哈维尔',
          ),
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  const slider = page.getByRole('slider', { name: 'Story position' });
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.06, y, { steps: 10 });
  await page.mouse.move(box.x + box.width * 0.17, y, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop fast-forward', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Stop fast-forward', exact: true })
    .click();
  await slider.focus();
  let current = Number(await slider.inputValue());
  while (current !== 25) {
    await slider.press(current < 25 ? 'ArrowRight' : 'ArrowLeft');
    current = Number(await slider.inputValue());
  }
  await expect(page).toHaveURL(/line=M15033%3A64/);
  const rate = await host.evaluate(async (el) => {
    const clock = () =>
      (el as any).playbackDiagnostics.models.find((m: any) => m.id === '哈维尔')
        .animationTime;
    const start = performance.now(),
      before = clock();
    await new Promise<void>((resolve) => {
      const sample = () =>
        performance.now() - start >= 500
          ? resolve()
          : requestAnimationFrame(sample);
      requestAnimationFrame(sample);
    });
    return (clock() - before) / (performance.now() - start);
  });
  expect(rate).toBeGreaterThan(0.5);
  expect(rate).toBeLessThan(1.5);
});
