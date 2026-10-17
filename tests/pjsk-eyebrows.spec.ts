import { test, expect } from '@playwright/test';

test('both eyebrows render smoothly through subpixel movement', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 936 });
  // Instrument only the served test response; keep renderer internals private
  // in the application. This works with Vite and the production scene chunk.
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
  await page.goto('/read/pjsk/pjsk-cn-unit-20002?line=wonder_01_02%3A12');
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 90000 },
  );
  await page
    .getByTestId('pjsk-layers')
    .evaluate(
      (el) =>
        (el as HTMLElement & { playbackDiagnostics: unknown })
          .playbackDiagnostics,
    );
  const results = await page.evaluate(() => {
    // These objects belong to the real Cubism/Pixi renderer. Only this test's
    // response instrumentation exposes them for controlled pixel measurement.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = (globalThis as any).__pjskRenderProbe;
    player.app.ticker.stop();
    const results: {
      name: string;
      meshes: number;
      width: number;
      height: number;
      energy: number;
      maxJump: number;
    }[] = [];
    for (const [name, view] of player.models) {
      if (!view.model.visible) continue;
      const core = view.model.internalModel.coreModel,
        model = core.getModel();
      view.facial.update(core, performance.now() / 1000);
      const saved = model.parameters.values.slice();
      core.update();
      const before = model.drawables.vertexPositions.map(
        (values: Float32Array) => values.slice(),
      );
      core.setParameterValueById('ParamBrowRY', -1);
      core.setParameterValueById('ParamBrowLY', -1);
      core.update();
      const affected: number[] = before
        .map((arr: Float32Array, i: number) =>
          arr.some(
            (v, k) =>
              Math.abs(v - model.drawables.vertexPositions[i][k]) > 0.00001,
          )
            ? i
            : -1,
        )
        .filter((i: number) => i >= 0);
      model.parameters.values.set(saved);
      core.update();
      player.app.renderer.render(player.app.stage);
      const points = affected.flatMap((i) => {
        const verts = view.model.internalModel.getDrawableVertices(i),
          points = [];
        for (let k = 0; k < verts.length; k += 2)
          points.push(view.model.toGlobal({ x: verts[k], y: verts[k + 1] }));
        return points;
      });
      const x = Math.floor(Math.min(...points.map((p) => p.x))) - 1,
        y = Math.floor(Math.min(...points.map((p) => p.y))) - 1;
      const width = Math.ceil(Math.max(...points.map((p) => p.x))) - x + 1,
        height = Math.ceil(Math.max(...points.map((p) => p.y))) - y + 1;
      const renderer = player.app.renderer,
        resolution = renderer.resolution,
        gl = renderer.gl,
        base = view.model.x;
      const frames: number[][] = [];
      for (let n = 0; n < 41; n++) {
        view.model.x = base + n * 0.05;
        renderer.render(player.app.stage);
        const raw = new Uint8Array(
          width * height * 4 * resolution * resolution,
        );
        gl.readPixels(
          x * resolution,
          (renderer.screen.height - y - height) * resolution,
          width * resolution,
          height * resolution,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          raw,
        );
        const pixels = [];
        for (let yy = 0; yy < height; yy++)
          for (let xx = 0; xx < width; xx++)
            for (let channel = 0; channel < 3; channel++) {
              let sum = 0;
              for (let dy = 0; dy < resolution; dy++)
                for (let dx = 0; dx < resolution; dx++)
                  sum +=
                    raw[
                      ((yy * resolution + dy) * width * resolution +
                        xx * resolution +
                        dx) *
                        4 +
                        channel
                    ];
              pixels.push(sum / (resolution * resolution));
            }
        frames.push(pixels);
      }
      view.model.x = base;
      let maxJump = 0;
      for (let n = 1; n < frames.length; n++)
        for (let k = 0; k < frames[n].length; k++)
          maxJump = Math.max(
            maxJump,
            Math.abs(frames[n][k] - frames[n - 1][k]),
          );
      results.push({
        name,
        meshes: affected.length,
        width,
        height,
        energy: frames[0].reduce((a, b) => a + b, 0),
        maxJump,
      });
    }
    return results;
  });
  await testInfo.attach('brow-pixel-movement', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  expect(results.map((row) => row.name).sort()).toEqual([
    '13tsukasa_cloth001',
    '14emu_unit',
  ]);
  for (const row of results) {
    expect(row.meshes).toBeGreaterThan(0);
    expect(row.width).toBeLessThan(100);
    expect(row.height).toBeLessThan(40);
    expect(row.energy).toBeGreaterThan(1000);
    expect(row.maxJump).toBeGreaterThan(0);
    expect(
      row.maxJump,
      `${row.name} eyebrow pixels pop during a 0.05px movement`,
    ).toBeLessThan(30);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});
