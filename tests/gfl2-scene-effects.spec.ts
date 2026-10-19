import { test, expect } from '@playwright/test';

test('shadow ramp uses original screen-space equation across display densities and letterboxing', async ({
  browser,
}) => {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 900 },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto('/library');
    const result = await page.evaluate(async () => {
      const module = '/src/playback/gfl2/event-stage.ts';
      const { EventStage } = await import(module);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:1000px;height:900px';
      document.body.append(host);
      const program = {
        version: 1,
        id: 'shadow',
        backgrounds: { white: { color: '#ffffff' } },
        characters: {},
        layers: { BgDefault: { type: 'Bg', x: 0, y: 0, order: 1 } },
        audio: {},
        files: [],
        unresolved: [],
        steps: [],
      };
      const errors: string[] = [];
      const stage = new EventStage(host, program, (message: string) =>
        errors.push(message),
      );
      const layer = {
        id: 'white',
        asset: 'white',
        kind: 'background',
        layer: 'BgDefault',
        pattern: [],
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        alpha: 1,
        color: '#ffffff',
        darkness: 0.8,
        maskHeight: 0.2,
        order: 1,
        sourceRow: 1,
        fade: 0,
        delay: 0,
      };
      try {
        stage.show(
          {
            layers: [layer],
            music: null,
            ambience: [],
            shots: [],
            zoom: { scale: 1, x: 0, y: 0, duration: 0 },
            params: {},
            warnings: [],
          },
          true,
        );
        const deadline = performance.now() + 5000;
        while (stage.diagnostics.pending.length && performance.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 20));
        stage.app.ticker.stop();
        stage.app.render();
        const gl: WebGLRenderingContext = stage.app.renderer.gl;
        const ratio = gl.drawingBufferWidth / 1000;
        const sceneHeight = (1000 / 1280) * 720;
        const top = (900 - sceneHeight) / 2;
        const sample = (fraction: number) => {
          const y = Math.floor((top + fraction * sceneHeight) * ratio);
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(500 * ratio),
            gl.drawingBufferHeight - y - 1,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          const screenY = ((y + 0.5) / ratio - top) / sceneHeight;
          return {
            actual: pixel[0],
            expected: Math.round(
              255 * (1 + 0.8 * (Math.pow(Math.max(0, screenY - 0.2), 5) - 1)),
            ),
          };
        };
        const samples = [0.1, 0.5, 0.9].map(sample);
        return { errors, samples };
      } finally {
        stage.dispose();
        host.remove();
      }
    });
    expect(result.errors).toEqual([]);
    for (const sample of result.samples)
      expect(Math.abs(sample.actual - sample.expected)).toBeLessThanOrEqual(2);
    expect(result.samples[2].actual).toBeGreaterThan(
      result.samples[0].actual + 20,
    );
    await context.close();
  }
});

test('the reported passage no longer resurrects outgoing characters, including after seek and reload', async ({
  page,
}) => {
  const route = '/read/gfl2/gfl2-ilion-34401?line=M22003%3A176';
  await page.goto(route);
  const host = page.getByTestId('native-layers');
  const characters = () =>
    host.evaluate(
      (element) =>
        (
          element as HTMLElement & {
            playbackDiagnostics?: { models: unknown[] };
          }
        ).playbackDiagnostics?.models,
    );
  await expect.poll(characters).toEqual([]);
  await page.reload();
  await expect.poll(characters).toEqual([]);
  await page.screenshot({
    path: 'private-review/events/ilion-overlap-fixed.png',
  });
});

test('the original hologram material renders blue animated scanlines and survives reload', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  await page.goto('/read/gfl2/gfl2-ilion-34401?line=M22003%3A192');
  const host = page.getByTestId('native-layers');
  await expect
    .poll(() =>
      host.evaluate((element) =>
        (
          element as HTMLElement & {
            playbackDiagnostics?: { models: { hologram?: string }[] };
          }
        ).playbackDiagnostics?.models.map((model) => model.hologram),
      ),
    )
    .toContain('SenCharEff_Plot_CommunStart_holo_02');
  await page.screenshot({
    path: 'private-review/events/ilion-hologram-fixed.png',
  });
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
      (step: { id: string }) => step.id === 'M22003:192',
    );
    const state = buildTimeline(program)[index];
    state.layers = state.layers.filter(
      (layer: { kind: string }) => layer.kind === 'character',
    );
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1280px;height:720px';
    document.body.append(host);
    const stage = new EventStage(host, program, () => {});
    try {
      stage.configure('male', true);
      stage.show(state, true);
      const deadline = performance.now() + 10000;
      while (
        !stage.diagnostics.models.some(
          (model: { hologram?: string }) => model.hologram,
        ) &&
        performance.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
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
      const filters = [...stage.views.values()].flatMap(
        (view: {
          root: {
            filters: {
              update?: (t: number) => void;
              uniforms: Record<string, unknown>;
            }[];
          };
        }) => view.root.filters,
      );
      const holograms = filters.filter(
        (filter) => 'uHoloAlpha' in filter.uniforms,
      );
      holograms.forEach((filter) => filter.update?.(0));
      const a = frame();
      holograms.forEach((filter) => filter.update?.(1));
      const b = frame();
      holograms.forEach((filter) => filter.update?.(0));
      stage.app.renderer.backgroundColor = 0xffffff;
      const onWhite = frame();
      stage.app.renderer.backgroundColor = 0x000000;
      for (const view of stage.views.values())
        view.root.filters = view.root.filters.filter(
          (filter: { uniforms: Record<string, unknown> }) =>
            !('uHoloAlpha' in filter.uniforms),
        );
      const reference = frame();
      let changed = 0,
        count = 0,
        red = 0,
        blue = 0,
        referenceRed = 0,
        referenceBlue = 0,
        transmitted = 0,
        clippedCyan = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (
          Math.abs(a[i] - b[i]) +
            Math.abs(a[i + 1] - b[i + 1]) +
            Math.abs(a[i + 2] - b[i + 2]) >
          1
        )
          changed++;
        if (reference[i] + reference[i + 1] + reference[i + 2] > 100) {
          count++;
          red += a[i];
          blue += a[i + 2];
          referenceRed += reference[i];
          referenceBlue += reference[i + 2];
          transmitted += onWhite[i] - a[i];
          if (a[i + 1] > 245 && a[i + 2] > 245) clippedCyan++;
        }
      }
      return {
        changed,
        count,
        ratio: blue / Math.max(1, red),
        referenceRatio: referenceBlue / Math.max(1, referenceRed),
        holograms: holograms.length,
        transmission: transmitted / count,
        clippedCyanFraction: clippedCyan / count,
      };
    } finally {
      stage.dispose();
      host.remove();
    }
  });
  expect(result.holograms).toBe(1);
  expect(result.count).toBeGreaterThan(1000);
  expect(result.changed).toBeGreaterThan(1000);
  expect(result.ratio).toBeGreaterThan(result.referenceRatio * 1.25);
  expect(result.transmission).toBeGreaterThan(40);
  expect(result.clippedCyanFraction).toBeLessThan(0.01);
  expect(failures).toEqual([]);
  await page.reload();
  await expect
    .poll(() =>
      host.evaluate((element) =>
        (
          element as HTMLElement & {
            playbackDiagnostics?: { models: { hologram?: string }[] };
          }
        ).playbackDiagnostics?.models.map((model) => model.hologram),
      ),
    )
    .toContain('SenCharEff_Plot_CommunStart_holo_02');
});

test('the reported standard hologram uses the softer projection', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-cn-4028-32990?line=M15033%3A204');
  await expect
    .poll(() =>
      page.getByTestId('native-layers').evaluate(
        (element) =>
          (
            element as HTMLElement & {
              playbackDiagnostics?: {
                models: { id: string; hologram?: string }[];
              };
            }
          ).playbackDiagnostics?.models.find((model) => model.id === '爵士')
            ?.hologram,
      ),
    )
    .toBe('SenCharEff_CommunStart_holo_01');
  await page.screenshot({
    path: 'private-review/events/doctor-hologram-softened.png',
  });
});

test('the second hologram material also loads from cached textures when their server requests fail', async ({
  page,
}) => {
  const route = '/read/gfl2/gfl2-ilion-34482?line=M22006%3A31';
  await page.goto(route);
  const host = page.getByTestId('native-layers');
  const effects = () =>
    host.evaluate((element) =>
      (
        element as HTMLElement & {
          playbackDiagnostics?: { models: { hologram?: string }[] };
        }
      ).playbackDiagnostics?.models.map((model) => model.hologram),
    );
  await expect
    .poll(effects, { timeout: 15000 })
    .toContain('SenCharEff_CommunStart_holo_01');
  const cachedEffects = await page.evaluate(async () => {
    const manifest = await (
      await fetch('/src/generated/gfl2-ilion-scenes.json')
    ).json();
    const program = await (
      await fetch(manifest.sections['gfl2-ilion-34482'].url)
    ).json();
    const cache = await caches.open('onlystory.media.v1');
    const effectManifest = await (
      await fetch('/private/gfl2-effects/manifest.json')
    ).json();
    const urls = effectManifest.files.map(
      (file: { url: string }) => file.url,
    ) as string[];
    for (const url of urls) {
      if (!program.files.some((file: { url: string }) => file.url === url))
        continue;
      await cache.put(url, await fetch(url));
    }
    return urls;
  });
  for (const url of cachedEffects)
    await page.route(`**${url}`, (route) => route.abort());
  await page.reload();
  await expect
    .poll(effects, { timeout: 15000 })
    .toContain('SenCharEff_CommunStart_holo_01');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect
    .poll(effects, { timeout: 15000 })
    .toContain('SenCharEff_CommunStart_holo_01');
});
