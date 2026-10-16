import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const available = existsSync('public/private/gfl2-opening/provenance.json');
const next = (page: Page) =>
  page.getByRole('button', { name: 'Next passage', exact: true }).click();
const diagnostics = (page: Page) =>
  page.getByTestId('native-layers').evaluate(
    (el) =>
      (
        el as HTMLElement & {
          playbackDiagnostics: {
            context: string;
            buffers: number;
            playing: {
              cue: string;
              loop: boolean;
              loopStart: number;
              loopEnd: number;
            }[];
            layers: string[];
          };
        }
      ).playbackDiagnostics,
  );

test('progress seeks restore the native scene and rapid playback cleans up original audio', async ({
  page,
}) => {
  test.skip(!available, 'Import the local GFL2 prototype first.');
  await page.goto('/read/gfl2/gfl2-a33001-opening');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('7');
  await expect(page.locator('.speaker-row')).toContainText('希娅');
  await expect
    .poll(async () =>
      (await diagnostics(page)).layers.includes('BG_None_Vow_01'),
    )
    .toBe(true);
  await position.fill('1');
  await expect
    .poll(async () =>
      (await diagnostics(page)).layers.includes('BG_None_Carriage_02_02'),
    )
    .toBe(true);
  await position.fill('0');
  await expect
    .poll(async () => (await diagnostics(page)).layers)
    .toEqual(['BG_None_Black_01', '白']);
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page.locator('.episode-end')).toContainText(
    '后续角色演出尚未接入',
  );
  await expect
    .poll(async () => (await diagnostics(page)).playing.length)
    .toBe(0);
  await expect
    .poll(async () => (await diagnostics(page)).layers)
    .toEqual(['BG_None_Black_01']);
});

test('scene click advances the real passage at the reported viewport', async ({
  page,
}) => {
  test.skip(!available, 'Import the local GFL2 prototype first.');
  await page.setViewportSize({ width: 487, height: 661 });
  await page.goto('/read/gfl2/gfl2-a33001-opening?line=A33001%3A27');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.mouse.click(163, 196);
  await expect(page).toHaveURL(/line=A33001%3A30/);
  await expect(page.locator('.speaker-row')).toContainText('希娅');
});

test('real GFL2 opening plays original text, CGs and looped audio through the shared reader', async ({
  page,
  request,
}, testInfo) => {
  test.skip(!available, 'Import the local GFL2 prototype first.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/library');
  await expect(page.getByText('The last train', { exact: true })).toHaveCount(
    0,
  );
  await page.goto('/read/gfl2/gfl2-a33001-opening');
  await expect(page.locator('.dialogue-window')).toContainText(
    '2074年X月X日，艾莫号',
  );
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('0');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  if (
    await page
      .getByRole('button', { name: 'Enable scene audio', exact: true })
      .isVisible()
  )
    try {
      await page
        .getByRole('button', { name: 'Enable scene audio', exact: true })
        .click({ timeout: 1000 });
    } catch (error) {
      // Chrome can resume a preloaded context after an earlier trusted gesture,
      // removing the prompt between isVisible() and click(). Require that state.
      if ((await diagnostics(page)).context !== 'running') throw error;
    }
  await expect.poll(async () => (await diagnostics(page)).buffers).toBe(6);
  await expect
    .poll(async () => (await diagnostics(page)).context)
    .toBe('running');
  const music = (await diagnostics(page)).playing.find(
    (item) => item.cue === '黄区荒凉废墟',
  );
  expect(music?.loop).toBe(true);
  expect(music?.loopStart).toBe(6.4);
  expect(music?.loopEnd).toBeGreaterThan(134);
  expect(
    (await diagnostics(page)).playing.filter((item) => item.cue === '2010121'),
  ).toHaveLength(2);
  await next(page);
  const carriage = page.locator(
    '.native-layer[data-label="BG_None_Carriage_02_02"] img',
  );
  await expect
    .poll(() =>
      carriage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(2048);
  await expect
    .poll(async () => (await diagnostics(page)).layers.includes('白'))
    .toBe(false);
  const ledger = JSON.parse(
    readFileSync('public/private/gfl2-opening/provenance.json', 'utf8'),
  );
  const imageFile = ledger.files.find((file: { url: string }) =>
    file.url.endsWith('BG_None_Carriage_02_02.png'),
  );
  const response = await request.get(imageFile.url);
  expect(response.ok()).toBe(true);
  expect(
    createHash('sha256')
      .update(await response.body())
      .digest('hex'),
  ).toBe(imageFile.sha256);
  await page.screenshot({ path: testInfo.outputPath('gfl2-carriage.png') });
  await next(page);
  await expect(page.locator('.dialogue-window')).toContainText(
    '钢铁巨兽艾莫号',
  );
  await next(page);
  await expect
    .poll(async () =>
      (await diagnostics(page)).playing.some((item) => item.cue === '2010121'),
    )
    .toBe(false);
  await next(page);
  await expect(page.locator('.window-system')).toContainText('系统自检');
  await next(page);
  await expect
    .poll(() =>
      page
        .locator('.native-layer[data-label="BG_None_Vow_01"] img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(2048);
  await next(page);
  await next(page);
  await expect(page.locator('.speaker-row')).toContainText('希娅');
  await page
    .getByRole('button', { name: 'Bookmark passage', exact: true })
    .click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /2074年X月X日，艾莫号/ }).click();
  await expect(page).toHaveURL(/line=A33001%3A6/);
  await expect
    .poll(async () => (await diagnostics(page)).layers)
    .toEqual(['BG_None_Black_01', '白']);
  await page.goto('/bookmarks');
  await page.getByRole('link', { name: /金翅雀与橄榄枝/ }).click();
  await expect(page.locator('.speaker-row')).toContainText('希娅');
  await expect
    .poll(async () =>
      (await diagnostics(page)).layers.includes('BG_None_Vow_01'),
    )
    .toBe(true);
  for (let i = 0; i < 4; i++) await next(page);
  await expect(page.locator('.dialogue-window')).toContainText('心智载入开始');
  await expect(page.locator('.episode-end')).toContainText(
    '后续角色演出尚未接入',
  );
  await expect(
    page.getByRole('slider', { name: 'Story position' }),
  ).toHaveAttribute('aria-valuetext', 'Passage 12 of 12');
  await expect
    .poll(async () => (await diagnostics(page)).playing.length)
    .toBe(0);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real Chinese lines fit the small reader and unavailable games do not show invented stories', async ({
  page,
}, testInfo) => {
  test.skip(!available, 'Import the local GFL2 prototype first.');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/games/pjsk');
  await expect(
    page.getByRole('heading', { name: 'No events imported yet' }),
  ).toBeVisible();
  await page.goto('/read/gfl2/gfl2-a33001-opening?line=A33001%3A27');
  await expect(page.locator('.dialogue-window')).toContainText('一只苍白的手');
  await expect
    .poll(() =>
      page
        .locator('.native-layer[data-label="BG_None_Vow_01"] img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(2048);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gfl2-mobile.png') });
});

test('downloaded original CGs and audio work when the media server is offline', async ({
  page,
  context,
}) => {
  test.skip(!available, 'Import the local GFL2 prototype first.');
  await page.goto('/manage?previews=1');
  await page
    .getByRole('button', { name: 'Download 金翅雀与橄榄枝', exact: true })
    .click();
  await expect(
    page.getByText('“金翅雀与橄榄枝” is available on this device.'),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('link', { name: '金翅雀与橄榄枝', exact: true }).click();
  await expect(page.locator('.dialogue-window')).toContainText('2074年X月X日');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await next(page);
  const image = page.locator(
    '.native-layer[data-label="BG_None_Carriage_02_02"] img',
  );
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(2048);
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect.poll(async () => (await diagnostics(page)).buffers).toBe(6);
  await context.setOffline(false);
});
