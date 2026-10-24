import { test, expect, type Page } from '@playwright/test';

async function instant(page: Page) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: /Characters per second/ }).fill('0');
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await page.getByRole('slider', { name: /Voice volume/ }).fill('0');
  await page.getByRole('slider', { name: /Music volume/ }).fill('0');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}
const next = (page: Page) =>
  page.getByRole('button', { name: 'Next passage', exact: true }).click();

test('scene advance preserves drag selection and choice buttons', async ({
  page,
}) => {
  await instant(page);
  await page.goto('/read/ba/ba-1?line=arrival');
  const text = page.locator('.dialogue-window p');
  const first = await text.locator('span').first().boundingBox();
  await page.mouse.move(first!.x + 1, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + 140, first!.y + first!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString().length),
  ).toBeGreaterThan(0);
  await expect(page).toHaveURL(/line=arrival/);
  await page.getByTestId('scene-stage').click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(/line=arrival/);
  await page.getByTestId('scene-stage').click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(/line=signal/);
  await page.getByTestId('scene-stage').click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(/line=decision/);
  await page.getByTestId('scene-stage').click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(/line=decision/);
  await page
    .getByRole('button', { name: 'Stay and listen', exact: true })
    .click();
  await expect(page).toHaveURL(/line=listen/);
});

test.describe('touch scene reading', () => {
  test.use({ hasTouch: true, viewport: { width: 487, height: 661 } });
  test('tap reveals unfinished text before advancing', async ({ page }) => {
    await instant(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByRole('slider', { name: 'Characters per second', exact: true })
      .fill('1');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/read/ba/ba-1?line=arrival');
    await expect(
      page.getByRole('button', { name: 'Reveal text', exact: true }),
    ).toBeVisible();
    await page.touchscreen.tap(163, 196);
    await expect(page).toHaveURL(/line=arrival/);
    await expect(
      page.getByRole('button', { name: 'Next passage', exact: true }),
    ).toBeVisible();
    await page.touchscreen.tap(163, 196);
    await expect(page).toHaveURL(/line=signal/);
  });
});

test('library, branch history, bookmarks and checkpoint restore retain passage URLs', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await instant(page);
  await page.goto('/games/gfl2?examples=1');
  await page.getByRole('link', { name: /Night platform/ }).click();
  await page.getByRole('link', { name: /Main story.*The last train/ }).click();
  await next(page);
  await next(page);
  await page
    .getByRole('button', { name: 'Follow the signal', exact: true })
    .click();
  await expect(page.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  await page
    .getByRole('button', { name: 'Bookmark passage', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save points', exact: true }).click();
  await page.getByRole('button', { name: 'Save current point' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await next(page);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: /A faint signal is coming/ }).click();
  await page
    .getByRole('button', { name: 'Stay and listen', exact: true })
    .click();
  await expect(page).toHaveURL(/choices=.*listen/);
  await page.getByRole('button', { name: 'Save points', exact: true }).click();
  await page
    .getByRole('button', { name: 'Restore checkpoint', exact: true })
    .click();
  await expect(page.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  const url = page.url();
  await page.reload();
  await expect(page.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  const second = await context.newPage();
  await second.goto(url);
  await expect(second.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  await second.close();
  await page.goto('/bookmarks');
  await page.getByRole('link', { name: /Take the light/ }).click();
  await expect(page).toHaveURL(/choices=.*follow/);
  await page.goBack();
  await expect(page).toHaveURL(/bookmarks/);
  await page.goForward();
  await expect(page.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  expect(errors).toEqual([]);
});

test('auto schedules the first choice, fast-forward stops at movies, and actual video seeks and restores', async ({
  page,
}) => {
  await instant(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: /Auto reading delay/ }).fill('2');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/read/pjsk/pjsk-1?line=signal');
  await page.getByRole('button', { name: 'Auto reading', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Follow the signal', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause auto reading', exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .locator('.story-choices > button')
      .first()
      .locator('.auto-choice-spinner'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Pause auto reading', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Stay and listen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeDisabled();
  await video.evaluate(async (el: HTMLVideoElement) => {
    if (el.readyState < 1)
      await new Promise((resolve) =>
        el.addEventListener('loadedmetadata', resolve, { once: true }),
      );
    el.currentTime = 2;
    await el.play();
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(2.3);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await page.reload();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(2);
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.currentTime = 5.7;
    await el.play();
  });
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeEnabled();
  await next(page);
  await expect(page.locator('.episode-end')).toContainText('Episode finished');
});

test('failures stay local, unknown scenes block skipping, and invalid URLs explain the problem', async ({
  page,
}) => {
  await instant(page);
  await page.goto('/read/ba/ba-1?fixture=missing-background&line=arrival');
  await expect(
    page.getByText('Background unavailable. You can keep reading.'),
  ).toBeVisible();
  await next(page);
  await expect(page.locator('.dialogue-window')).toContainText(
    'Wait. Did you hear',
  );
  await page.getByRole('button', { name: 'Retry scene', exact: true }).click();
  await expect(page).not.toHaveURL(/fixture=/);
  await page.goto(
    '/read/gfl1/gfl1-3?line=gap&choices=%7B%22decision%22%3A%22listen%22%7D',
  );
  await expect(
    page.getByText(
      'This archive contains an unsupported or missing scene. It will not be skipped.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Read available text' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/read/gfl2/gfl2-1?line=unknown');
  await expect(
    page.getByRole('heading', { name: 'Passage unavailable' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open episode from the start' })
    .click();
  await expect(page.locator('.dialogue-window')).toContainText(
    'The last train had gone',
  );
  await page.goto('/read/gfl2/gfl2-2?fixture=offline');
  await expect(
    page.getByRole('heading', { name: 'This episode is not on this device' }),
  ).toBeVisible();
  await page.goto('/read/gfl2/gfl2-1?fixture=expired');
  await expect(
    page.getByRole('heading', { name: 'Server session expired' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to device library' }).click();
  await expect(page).toHaveURL(/library/);
});

test('download cancellation, retry, navigation and cached media are real', async ({
  page,
}) => {
  await page.goto('/manage?examples=1');
  const row = page
    .locator('.download-item')
    .filter({ hasText: 'GFL2 · Night platform' })
    .filter({
      has: page.getByRole('link', {
        name: 'A signal after midnight',
        exact: true,
      }),
    });
  let release!: () => void;
  await page.route('**/demo/platform.svg', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue().catch(() => {});
  });
  await row
    .getByRole('button', {
      name: 'Download A signal after midnight',
      exact: true,
    })
    .click();
  await expect(
    row.getByRole('button', { name: /Cancel download/ }),
  ).toBeVisible();
  await expect.poll(() => typeof release).toBe('function');
  await row.getByRole('button', { name: /Cancel download/ }).click();
  await expect(row).toContainText('Download canceled');
  release();
  await page.unroute('**/demo/platform.svg');
  await page.route('**/demo/voice.wav', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await row
    .getByRole('button', {
      name: 'Download A signal after midnight',
      exact: true,
    })
    .click();
  await expect(row.getByRole('alert')).toContainText(
    'voice.wav is unavailable',
  );
  await page.unroute('**/demo/voice.wav');
  await row.getByRole('button', { name: /Retry download/ }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(
    page.getByText('“A signal after midnight” is available on this device.'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (await (await caches.open('onlystory.media.v1')).keys()).filter(
          (request) =>
            new URL(request.url).pathname !== '/private/shared/index.json',
        ).length,
    ),
  ).toBe(7);
  await page.goto('/read/gfl2/gfl2-2?fixture=offline');
  await expect(
    page.getByRole('region', { name: 'Story reader' }),
  ).toBeVisible();
  await page.goto('/manage?examples=1');
  await row.getByRole('button', { name: /Remove download/ }).click();
  await expect(row).toContainText('Available to download');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row).toContainText('On this device');
});

test('themes persist, backups export, invalid import preserves progress and keyboard focus returns', async ({
  page,
}) => {
  await instant(page);
  await page.goto('/read/ba/ba-1');
  await next(page);
  await page.keyboard.press('Control+,');
  await page.getByLabel('Layout', { exact: true }).selectOption('desk');
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  expect((await download).suggestedFilename()).toBe('onlystory-backup.json');
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByRole('alert')).toContainText('not a supported');
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('onlystory.v1')!),
  );
  backup.preferences.fontSize = 26;
  backup.installed['gfl2-2'] = true;
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'valid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByText(
      'Backup merged. Newer progress and device downloads were kept.',
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('onlystory.v1')!).installed['gfl2-2'],
    ),
  ).not.toBe(true);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reader-page')).toHaveClass(/layout-desk/);
  await expect(page.locator('.dialogue-window')).toContainText(
    'Wait. Did you hear',
  );
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'History', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Find a command' }).fill('hstry');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^History/ })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Include unread passages and alternate branches',
  );
});

test('large catalogs keep a bounded DOM, search deep results and restore scroll', async ({
  page,
}) => {
  await page.goto('/games/gfl2?stress=10000&sort=story');
  await expect(page.getByText('10,000 events')).toBeVisible();
  expect(await page.locator('.event-row').count()).toBeLessThan(25);
  const rowHeight = await page
    .locator('.event-row')
    .first()
    .evaluate((row) => row.getBoundingClientRect().height);
  await page.locator('.catalog-scroll').evaluate((el, height) => {
    el.scrollTop = height * 500;
  }, rowHeight);
  const visibleArchive = await page
    .locator('.catalog-scroll')
    .evaluate((el) => {
      const viewport = el.getBoundingClientRect();
      return [...el.querySelectorAll('h2')].find((heading) => {
        const box = heading.getBoundingClientRect();
        return box.top >= viewport.top && box.bottom <= viewport.bottom;
      })?.textContent;
    });
  expect(Number(visibleArchive?.match(/\d+/)?.[0])).toBeGreaterThan(300);
  const scrolled = await page
    .locator('.catalog-scroll')
    .evaluate((el) => el.scrollTop);
  await page.getByRole('link').filter({ hasText: visibleArchive! }).click();
  await page.goBack();
  await expect
    .poll(() => page.locator('.catalog-scroll').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(scrolled - 500);
  await page.getByRole('searchbox', { name: 'Search events' }).fill('09999');
  await expect(
    page.getByRole('heading', { name: 'Archive 09999', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('09999');
});

for (const size of [
  { width: 320, height: 700 },
  { width: 1024, height: 600 },
]) {
  test(`reader controls fit ${size.width}x${size.height} and text stays selectable`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size);
    await instant(page);
    await page.goto('/read/pjsk/pjsk-1');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const buttons = page.locator('.reader-toolbar button:visible');
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      if (size.width === 320) expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('.dialogue-window p').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    expect(
      await page.evaluate(() => window.getSelection()?.toString()),
    ).toContain('last train');
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page
      .getByRole('button', { name: 'Hide controls', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Show controls', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Show controls', exact: true })
      .click();
    await page.screenshot({ path: testInfo.outputPath('reader.png') });
  });
}

test('loading and failed voice leave text usable, and language changes preserve the branch', async ({
  page,
}) => {
  await instant(page);
  await page.goto('/read/pjsk/pjsk-1?fixture=missing-voice&line=signal');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await page.getByRole('slider', { name: /Voice volume/ }).fill('0.8');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByText('Voice unavailable. Reading can continue.'),
  ).toBeVisible();
  await next(page);
  await page
    .getByRole('button', { name: 'Follow the signal', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Reading language' })
    .selectOption('zh-CN');
  await expect(page.locator('.dialogue-window')).toContainText('拿好灯');
  await expect(page).toHaveURL(/choices=.*follow/);
  await page.goto('/read/ba/ba-1?fixture=loading&line=arrival');
  await expect(page.getByText('Loading scene…')).toBeVisible();
  await next(page);
  await expect(page).toHaveURL(/line=signal/);
});
