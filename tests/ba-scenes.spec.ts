import { preferJapaneseBa } from './helpers/ba-language';
import { test, expect, type Page } from '@playwright/test';
import { emptyData } from '../src/model';
import { selectPrologueOriginals } from './helpers/ba-originals';

test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => preferJapaneseBa(page));

test.setTimeout(90000);
test.describe.configure({ mode: 'serial' });
const reader = '/read/ba/ba-jp-11000';
const link = (row: number, branch = 's1') => {
  const answers: Record<string, string> = {};
  for (const r of [91, 105, 158, 164, 169])
    if (row > r) answers[`11000:${r}`] = 's0';
  if (row > 190) answers['11000:190'] = branch;
  if (row > 222) answers['11000:222'] = 's3';
  return `${reader}?line=11000%3A${row}&choices=${encodeURIComponent(JSON.stringify(answers))}`;
};
const ready = async (page: Page) => {
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
};
const diagnostics = (page: Page) =>
  page
    .locator('.ba-canvas')
    .evaluate(
      (e) =>
        (e as HTMLElement & { playbackDiagnostics: any }).playbackDiagnostics,
    );

test('resumes suspended music and voice with the scene audio gesture', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options);
          (window as any).baTestContext = this;
        }
      },
    });
  });
  await page.goto(link(90));
  await ready(page);
  await page.evaluate(async () => {
    await (window as any).baTestContext.suspend();
    document.querySelector('audio')?.pause();
  });
  await expect(
    page.getByRole('button', { name: 'Enable scene audio', exact: true }),
  ).toBeVisible();
  expect((await diagnostics(page)).audio.context).toBe('suspended');
  await page
    .getByRole('button', { name: 'Enable scene audio', exact: true })
    .click();
  await expect
    .poll(async () => (await diagnostics(page)).audio.context)
    .toBe('running');
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0),
    )
    .toBe(true);
});

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  data.preferences.voice = 'ja';
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
});

test('fast-forward keeps the current BGM source playing', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).baMusicStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) (window as any).baMusicStarts++;
      return original.apply(this, args);
    };
  });
  await page.goto(link(90));
  await ready(page);
  await expect
    .poll(async () => (await diagnostics(page)).audio.activeMusic)
    .toBe(true);
  const starts = await page.evaluate(() => (window as any).baMusicStarts);
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '"……？"', exact: true }),
  ).toBeVisible();
  await ready(page);
  expect((await diagnostics(page)).state.music).toBe(9);
  expect(await page.evaluate(() => (window as any).baMusicStarts)).toBe(starts);
});

test('progress-bar clicks preserve the same BGM and switch at a different track', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).baMusicStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) (window as any).baMusicStarts++;
      return original.apply(this, args);
    };
  });
  await page.goto(link(115));
  await ready(page);
  await expect
    .poll(async () => (await diagnostics(page)).audio.activeMusic)
    .toBe(true);
  const starts = await page.evaluate(() => (window as any).baMusicStarts);
  const chapter = await (
    await page.request.get('/private/ba-jp/11000/chapter.json')
  ).json();
  const seek = async (row: number) => {
    const slider = page.getByRole('slider', {
      name: 'Story position',
      exact: true,
    });
    const box = (await slider.boundingBox())!;
    const index = chapter.nodes.findIndex(
      (n: { id: string }) => n.id === `11000:${row}`,
    );
    const max = Number(await slider.getAttribute('max'));
    await page.mouse.click(
      box.x + (box.width * index) / max,
      box.y + box.height / 2,
    );
    await expect(page).toHaveURL(new RegExp(`line=11000%3A${row}(?:&|$)`));
    await ready(page);
  };
  await seek(130);
  expect(await page.evaluate(() => (window as any).baMusicStarts)).toBe(starts);
  await seek(115);
  expect(await page.evaluate(() => (window as any).baMusicStarts)).toBe(starts);
  await seek(100);
  await expect.poll(async () => (await diagnostics(page)).audio.music).toBe(9);
  await expect
    .poll(() => page.evaluate(() => (window as any).baMusicStarts))
    .toBe(starts + 1);
});

test('the final Yuuka close-up keeps her head inside the scene', async ({
  page,
}, testInfo) => {
  await page.goto(link(228));
  await ready(page);
  await expect
    .poll(async () => (await diagnostics(page)).frames)
    .toBeGreaterThan(0.3);
  expect((await diagnostics(page)).state.actors['유우카'].closeup).toBe(true);
  const clippedPixels = await page.locator('.ba-actors').evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          const context = copy.getContext('2d')!;
          context.drawImage(canvas, 0, 0);
          const pixels = context.getImageData(0, 0, copy.width, 1).data;
          let count = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
          resolve(count);
        });
      }),
  );
  await page.screenshot({ path: testInfo.outputPath('yuuka-closeup.png') });
  expect(clippedPixels).toBe(0);
});

test('dust has transparent edges instead of rectangular texture backgrounds', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(link(206));
  await ready(page);
  const alpha = await page
    .locator('.ba-dust')
    .first()
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        edge: context.getImageData(0, 0, 1, 1).data[3],
        smoke: context.getImageData(128, 64, 1, 1).data[3],
      };
    });
  await page.screenshot({ path: testInfo.outputPath('dust.png') });
  expect(alpha.edge).toBe(0);
  expect(alpha.smoke).toBeGreaterThan(0);
});

test('renders original CGs and animated characters, and plays Japanese voice and looping BGM', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = Date.now();
  await page.goto(link(90));
  await ready(page);
  expect(Date.now() - start).toBeLessThan(30000);
  const scene = await diagnostics(page);
  expect(scene.models).toBe(6);
  expect(scene.renderer).toBe('Spine 4.2');
  expect(scene.state.background).toBe(2792121820);
  expect(scene.state.music).toBe(9);
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /rin_spr:/,
  );
  await expect
    .poll(async () => (await diagnostics(page)).audio.activeMusic)
    .toBe(true);
  await expect
    .poll(async () => (await diagnostics(page)).audio.context)
    .toBe('running');
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate((a: HTMLAudioElement) => ({
          playing: !a.paused,
          valid: a.duration > 0,
          time: a.currentTime > 0,
        })),
    )
    .toEqual({ playing: true, valid: true, time: true });
  const clock = scene.frames;
  await expect
    .poll(async () => (await diagnostics(page)).frames)
    .toBeGreaterThan(clock + 0.1);
  await page.screenshot({ path: testInfo.outputPath('ba-rin.png') });
  await page.goto(link(71));
  await ready(page);
  await expect(page.locator('.ba-background')).toHaveAttribute(
    'data-background-id',
    '2457801742',
  );
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    '',
  );
  expect(errors).toEqual([]);
});

test('plays timed source commands, preserves both opening captions and can finish the montage', async ({
  page,
}) => {
  await page.goto(reader);
  await expect(page.getByTestId('ba-scene')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.getByRole('button', { name: 'Finish scene', exact: true }).click();
  await ready(page);
  await expect(page.locator('.ba-captions p')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.getByRole('button', { name: 'Finish scene', exact: true }).click();
  await ready(page);
  await expect(page.locator('.ba-captions p')).toHaveCount(2);
  await page.goto(link(12));
  await ready(page);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page.getByRole('button', { name: 'Finish scene', exact: true }).click();
  await ready(page);
  expect((await diagnostics(page)).state.music).toBe(10034);
  expect((await diagnostics(page)).state.background).toBe(1047754314);
});

test('restores branch scenes and original emotions, dust, gunfire and shot effects', async ({
  page,
}, testInfo) => {
  await page.goto(link(191));
  await ready(page);
  const a = (await diagnostics(page)).state;
  await page.goto(link(192, 's2'));
  await ready(page);
  const b = (await diagnostics(page)).state;
  expect(a.background).toBe(b.background);
  expect(a.music).toBe(b.music);
  await page.goto(link(207));
  await ready(page);
  await expect(page.locator('.ba-dust')).toHaveCount(12);
  await page.goto(link(208));
  await ready(page);
  await expect(page.locator('.ba-fireline')).toHaveCount(4);
  await page.goto(link(211));
  await ready(page);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  // The shot is on command-only row 212 attached to the next readable passage.
  await expect(page.locator('.ba-shot')).toBeVisible();
  await expect
    .poll(async () => (await diagnostics(page)).audio.playedSounds.length)
    .toBeGreaterThan(0);
  expect((await diagnostics(page)).audio.context).toBe('running');
  await ready(page);
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /yuuka_spr:/,
  );
  await page.screenshot({ path: testInfo.outputPath('ba-under-fire.png') });
});

test('downloaded models, backgrounds and voices reopen with every BA network request blocked', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await page.goto('/games/ba/events/ba-jp-prologue');
  await selectPrologueOriginals(page, testInfo);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[
              'ba-jp-11000'
            ],
        ),
      { timeout: 180000 },
    )
    .toBe(true);
  await page.route('**/private/ba-jp/**', (route) => route.abort());
  await page.goto(link(90));
  await ready(page);
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /rin_spr:/,
  );
  await expect
    .poll(async () => (await diagnostics(page)).audio.activeMusic)
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate((a: HTMLAudioElement) => a.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.reload();
  await ready(page);
  expect((await diagnostics(page)).models).toBe(6);
});

test('renders the communication portrait separately and keeps authored expressions', async ({
  page,
}, testInfo) => {
  await page.goto(link(184));
  await ready(page);
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /momoka_spr:02/,
  );
  await expect(page.locator('.ba-emotion img')).toHaveCount(3);
  await expect(page.locator('.ba-emotion img').first()).toBeVisible();
  const pixels = await page
    .locator('.ba-signal:not(.ba-white-silhouettes)')
    .evaluate((element: HTMLCanvasElement) => {
      const bytes = element
        .getContext('2d')!
        .getImageData(0, 0, element.width, element.height).data;
      let visible = 0;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) visible++;
      return visible;
    });
  expect(pixels).toBeGreaterThan(10000);
  await page.screenshot({ path: testInfo.outputPath('ba-communication.png') });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.screenshot({ path: testInfo.outputPath('ba-phone.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test.describe(() => {
  test.use({ serviceWorkers: 'block' });
  test('a missing original texture exposes retry and a working text fallback', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/media/characters/rin_spr/*.png', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );
    await page.goto(link(90));
    await expect(
      page.getByRole('button', { name: 'Read text instead', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await page
      .getByRole('button', { name: 'Read text instead', exact: true })
      .click();
    await expect(page.locator('.reader-page')).toHaveClass(/layout-text/);
    await expect(page.locator('.dialogue-window')).toBeVisible();
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '"……？"', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
