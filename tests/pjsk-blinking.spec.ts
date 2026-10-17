import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('closed-eye expression stays closed across loop boundaries after normal advancement', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        voiceVolume: 0,
        musicVolume: 0,
        soundVolume: 0,
      },
    },
  );
  await page.route(
    /\/(?:src\/playback\/pjsk\/runtime\.ts|assets\/PjskScene-[^/]+\.js)(?:\?|$)/,
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const patched = body.replace(
        /get diagnostics\(\)\s*\{/,
        '$& globalThis.__pjskRenderProbe=this;',
      );
      expect(patched).not.toBe(body);
      await route.fulfill({ response, body: patched });
    },
  );
  await page.goto('/read/pjsk/pjsk-cn-unit-30001?line=mmj_01_01%3A129');
  const stage = page.getByTestId('scene-stage');
  await expect(stage).toHaveAttribute('aria-busy', 'false', { timeout: 45000 });
  await page
    .getByTestId('pjsk-layers')
    .evaluate(
      (el) =>
        (el as HTMLElement & { playbackDiagnostics: unknown })
          .playbackDiagnostics,
    );
  await page.evaluate(() => {
    // Instrument the real rendered model after the expression layer runs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = (globalThis as any).__pjskRenderProbe;
    const view = player.models.get('05minori_normal');
    const core = view.model.internalModel.coreModel;
    const samples: {
      time: number;
      left: number;
      right: number;
      expression: string;
    }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__pjskBlinkSamples = samples;
    view.model.internalModel.on('beforeModelUpdate', () =>
      samples.push({
        time: performance.now(),
        left: core.getParameterValueById('ParamEyeLOpen'),
        right: core.getParameterValueById('ParamEyeROpen'),
        expression: view.expression,
      }),
    );
  });
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page).toHaveURL(/line=mmj_01_01%3A130/);
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(3400);
  const samples = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (globalThis as any).__pjskBlinkSamples as {
      time: number;
      left: number;
      right: number;
      expression: string;
    }[];
    const current = all.filter(
      (sample) => sample.expression === 'face_closeeye_02',
    );
    return current.filter((sample) => sample.time - current[0].time >= 250);
  });
  await testInfo.attach('rendered-eye-parameters.json', {
    body: JSON.stringify(samples),
    contentType: 'application/json',
  });
  expect(samples.length).toBeGreaterThan(60);
  expect(samples.at(-1)!.time - samples[0].time).toBeGreaterThan(2800);
  expect(
    Math.max(...samples.map((sample) => Math.abs(sample.left))),
  ).toBeLessThan(0.001);
  expect(
    Math.max(...samples.map((sample) => Math.abs(sample.right))),
  ).toBeLessThan(0.001);
  await page.screenshot({
    path: testInfo.outputPath('closed-eye-expression.png'),
  });
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page).toHaveURL(/line=mmj_01_01%3A132/);
  await expect(stage).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const samples = (globalThis as any).__pjskBlinkSamples as {
          left: number;
          right: number;
          expression: string;
        }[];
        const current = samples.at(-1)!;
        return (
          current.expression === 'face_serious_01' &&
          current.left > 0.99 &&
          current.right > 0.99
        );
      }),
    )
    .toBe(true);
});
