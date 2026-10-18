import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData } from '../src/model';

test('native Spine background renders and advances its authored animation', async ({
  page,
}) => {
  test.setTimeout(90000);
  const program = JSON.parse(
    readFileSync('public/private/ba-jp/11000/scenes.json', 'utf8'),
  );
  const background = JSON.parse(
    readFileSync('public/private/ba-jp/11020/assets.json', 'utf8'),
  ).backgrounds['3608265408'];
  expect(background.renderer).toBe('spine');
  program.assets.backgrounds['3608265408'] = background;
  const step = program.steps.find((entry: any) => entry.id === '11000:90');
  step.rows.at(-1).BGName = 3608265408;
  step.rows.at(-1).ScriptKr += '\n#all;hide';
  await page.route('**/private/ba-jp/11000/scenes.json*', (route) =>
    route.fulfill({ json: program }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/read/ba/ba-jp-11000?line=11000%3A90');
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 45000 },
  );
  await expect(page.locator('.ba-spine-background')).toBeVisible();
  const diagnostics = () =>
    page
      .locator('.ba-canvas')
      .evaluate((element: any) => element.playbackDiagnostics.spineBackground);
  await expect.poll(async () => (await diagnostics()).active).toBe(3608265408);
  const initial = await diagnostics();
  await expect
    .poll(async () => (await diagnostics()).frames)
    .toBeGreaterThan(initial.frames + 5);
  const coverage = await page
    .locator('.ba-spine-background')
    .evaluate((element: any) => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      const pixels = new Uint8Array(element.width * element.height * 4);
      gl.readPixels(
        0,
        0,
        element.width,
        element.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
      return opaque / (element.width * element.height);
    });
  expect(coverage).toBeGreaterThan(0.9);
  await page.screenshot({ path: 'test-results/ba-spine-background.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('white silhouettes replace colored texels and invisible actors require no skeleton', async ({
  page,
}) => {
  test.setTimeout(90000);
  const program = JSON.parse(
    readFileSync('public/private/ba-jp/11000/scenes.json', 'utf8'),
  );
  const step = program.steps.find((entry: any) => entry.id === '11000:90');
  step.rows.at(-1).ScriptKr += '\n#3;white';
  let invisible = false;
  await page.route('**/private/ba-jp/11000/scenes.json*', (route) => {
    const value = structuredClone(program);
    if (invisible)
      value.assets.characters['린'] = {
        model: 'invisible',
        name: '린',
        invisible: true,
        signal: false,
        expressionNames: [],
        skeleton: '',
        atlas: '',
        pages: [],
      };
    return route.fulfill({ json: value });
  });
  const data = emptyData();
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
  const open = async () => {
    await page.goto('/read/ba/ba-jp-11000?line=11000%3A90');
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  };
  const pixels = () =>
    page.locator('.ba-white-silhouettes').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const rgba = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0,
        colored = 0;
      for (let i = 0; i < rgba.length; i += 4)
        if (rgba[i + 3] > 200) {
          opaque++;
          if (rgba[i] < 250 || rgba[i + 1] < 250 || rgba[i + 2] < 250)
            colored++;
        }
      return { opaque, colored };
    });
  await open();
  await expect.poll(async () => (await pixels()).opaque).toBeGreaterThan(1000);
  expect((await pixels()).colored).toBe(0);
  invisible = true;
  await open();
  await expect.poll(async () => (await pixels()).opaque).toBe(0);
  const diagnostics = await page
    .locator('.ba-canvas')
    .evaluate((element: any) => element.playbackDiagnostics);
  expect(diagnostics.models).toBe(5);
  expect(diagnostics.state.actors['린'].visible).toBe(true);
});
