import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync('src/generated/gfl2-scenes.json', 'utf8'),
);

for (const deviceScaleFactor of [1.25, 2]) {
  test(`character color preserves original texture detail at ${deviceScaleFactor}× display density`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ deviceScaleFactor });
    const page = await context.newPage();
    try {
      await page.goto('/library');
      const result = await page.evaluate(async (url) => {
        // Load the real adapter through Vite, including its original Cubism model.
        const stageModule = '/src/playback/gfl2/event-stage.ts';
        const stateModule = '/src/playback/gfl2/event-state.ts';
        const { EventStage } = await import(stageModule);
        const { buildTimeline } = await import(stateModule);
        const program = await (await fetch(url)).json();
        const state = buildTimeline(program)[12];
        // Isolate Gaia against black so an unfiltered frame can provide an
        // independent, full-resolution reference for the scene's RGB tint.
        state.layers = state.layers.filter(
          (layer: { kind: string }) => layer.kind === 'character',
        );
        const layer = state.layers[0];
        const host = document.createElement('div');
        host.style.cssText =
          'position:fixed;inset:0;width:1280px;height:720px;z-index:9999';
        document.body.append(host);
        const errors: string[] = [];
        const stage = new EventStage(host, program, (m: string) =>
          errors.push(m),
        );
        try {
          stage.configure('male', true);
          stage.show(state, true);
          const deadline = performance.now() + 10000;
          while (
            stage.diagnostics.pending.length &&
            performance.now() < deadline
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          await new Promise((resolve) => setTimeout(resolve, 200));
          stage.app.ticker.stop();
          const gl: WebGLRenderingContext = stage.app.renderer.gl;
          const frame = () => {
            stage.app.render();
            const pixels = new Uint8Array(
              gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
            );
            gl.readPixels(
              0,
              0,
              gl.drawingBufferWidth,
              gl.drawingBufferHeight,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            return pixels;
          };
          const actual = frame();
          for (const view of stage.views.values()) view.root.filters = null;
          const reference = frame();
          const brightness =
            (1 - layer.darkness) * (layer.shaders?._Brightness ?? 1);
          const gains = [1, 3, 5].map(
            (offset) =>
              (parseInt(layer.color.slice(offset, offset + 2), 16) / 255) *
              brightness,
          );
          for (let i = 0; i < reference.length; i += 4)
            for (let c = 0; c < 3; c++)
              reference[i + c] = Math.round(reference[i + c] * gains[c]);
          const detail = (pixels: Uint8Array) => {
            let energy = 0;
            for (let y = 0; y < gl.drawingBufferHeight; y++)
              for (let x = 1; x < gl.drawingBufferWidth - 1; x++) {
                const i = (y * gl.drawingBufferWidth + x) * 4;
                for (let c = 0; c < 3; c++)
                  energy += Math.abs(
                    2 * pixels[i + c] - pixels[i + c - 4] - pixels[i + c + 4],
                  );
              }
            return energy;
          };
          const referenceDetail = detail(reference);
          return {
            errors,
            models: stage.diagnostics.models.length,
            referenceDetail,
            retainedDetail: detail(actual) / referenceDetail,
          };
        } finally {
          stage.dispose();
          host.remove();
        }
      }, manifest.sections['gfl2-event-3478101'].url);
      expect(result.errors).toEqual([]);
      expect(result.models).toBe(1);
      expect(result.referenceDetail).toBeGreaterThan(10000);
      expect(result.retainedDetail).toBeGreaterThan(0.9);
    } finally {
      await context.close();
    }
  });
}
