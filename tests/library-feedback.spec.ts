import { test, expect } from '@playwright/test';

test('download history groups attempts, expands stories and survives reload', async ({
  page,
}) => {
  await page.goto('/library');
  await page.evaluate(() =>
    localStorage.setItem(
      'onlystory.download-history.v1',
      JSON.stringify([
        { episodeId: 'ba-jp-11000', status: 'complete', bytes: 50, total: 50 },
        {
          episodeId: 'ba-jp-11001',
          status: 'canceled',
          bytes: 5,
          total: 50,
          fraction: 0.1,
        },
      ]),
    ),
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Download history', exact: true })
    .click();
  const panel = page.getByRole('dialog', { name: 'Downloads', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Downloaded');
  await expect(panel).toContainText('Canceled');
  await expect(panel.getByRole('progressbar')).toHaveCount(2);
  const summary = panel.locator('summary').first();
  const firstProgress = panel.getByRole('progressbar').first();
  await summary.click();
  await expect(firstProgress).toBeHidden();
  await summary.click();
  await expect(firstProgress).toBeVisible();
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download history', exact: true }),
  ).toBeFocused();
  const download = page.getByRole('button', {
    name: 'Select stories to download',
    exact: true,
  });
  await download.focus();
  await page.keyboard.press('ArrowDown');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.mouse.move(10, 200);
  await download.hover();
  await expect(panel).toBeVisible();
});

test('BA help explains region, languages, counts and agent preparation', async ({
  page,
}) => {
  await page.goto('/games/ba');
  await page
    .getByRole('button', { name: 'Blue Archive getting started', exact: true })
    .click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('JP and global players');
  await expect(panel).toContainText('Audio stays Japanese');
  await expect(panel).toContainText('Read counts stories you have finished');
  await expect(
    panel.getByRole('link', { name: 'Open asset preparation guide' }),
  ).toHaveAttribute('href', /asset-setup-for-agents/);
});

test('active download button opens queue and selection estimates do not restart', async ({
  page,
  context,
}) => {
  await context.route('https://storage.sekai.best/**', () => {});
  await page.goto('/games/pjsk/events/pjsk-cn-idol-main');
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  const stories = page.locator(
    '.story-card .download-selection-checkbox:enabled',
  );
  await stories.nth(0).check();
  const size = page.locator('.download-selection-size');
  await expect(size).toContainText(/\d.*new/, { timeout: 30000 });
  await stories.nth(1).check();
  await expect(size).not.toHaveText('Checking size…');
  await page
    .getByRole('button', { name: 'Download selected stories (2)', exact: true })
    .click();
  await page.getByRole('button', { name: /^Downloading 2 stories/ }).click();
  const panel = page.getByRole('dialog', { name: 'Downloads', exact: true });
  await expect(panel.getByRole('progressbar')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Add stories to download' }).click();
  await expect(stories.first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Cancel download selection', exact: true })
    .click();
  await page.getByRole('button', { name: /^Downloading 2 stories/ }).click();
  await panel.getByRole('button', { name: 'Add stories to download' }).click();
  await stories.first().check();
  await page
    .getByRole('button', { name: 'Download selected stories (1)', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /^Downloading 3 stories/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Cancel downloads', exact: true })
    .click();
});

test('catalog counts label reading progress and reject metadata-only availability', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'onlystory.v1',
      JSON.stringify({
        version: 1,
        preferences: {},
        saves: {},
        installed: { 'pjsk-cn-unit-30001': true },
        bookmarks: [],
        checkpoints: [],
      }),
    ),
  );
  await page.goto('/games/pjsk/events/pjsk-cn-idol-main');
  await expect(page.locator('.event-download-status')).toHaveText(
    /0 of \d+ downloaded · 0 read/,
  );
  await expect(
    page.locator('[data-story-id="pjsk-cn-unit-30001"] .downloaded-mark'),
  ).toHaveCount(0);
  await page.goto('/games/pjsk');
  await page.getByLabel('Collection layout').selectOption('table');
  await expect(
    page.locator('.event-table tbody tr').first().locator('td').nth(3),
  ).toHaveText(/0 of \d+ read/);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect
    .poll(() =>
      page
        .locator('.app-header')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
});

test('two windows keep live job ownership and preserve both completed histories', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/demo/**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/manage?examples=1&game=gfl2');
  await page.getByLabel('Search downloads').fill('A signal after midnight');
  const first = page.locator('.download-item').first();
  await first.getByRole('button', { name: /^Download / }).click();
  await expect(first.getByRole('progressbar')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/manage?examples=1&game=gfl2');
  await other
    .getByRole('button', { name: 'Download history', exact: true })
    .click();
  const history = other.getByRole('dialog', { name: 'Downloads', exact: true });
  await expect(history).toContainText('No downloads yet.');
  await expect(history).not.toContainText('Canceled');
  await history.getByRole('button', { name: 'Close', exact: true }).click();
  await other.getByLabel('Search downloads').fill('The last train');
  const second = other.locator('.download-item').first();
  await second.getByRole('button', { name: /^Download / }).click();
  await expect(second.getByRole('progressbar')).toBeVisible();
  release();
  await expect(first).toContainText('On this device', { timeout: 30000 });
  await expect(second).toContainText('On this device', { timeout: 30000 });
  await other
    .getByRole('button', { name: 'Download history', exact: true })
    .click();
  await expect(history.locator('li')).toHaveCount(2);
  await expect(history).not.toContainText('Canceled');
  await other.reload();
  await other
    .getByRole('button', { name: 'Download history', exact: true })
    .click();
  await expect(history.locator('li')).toHaveCount(2);
  await expect(history.locator('progress[value="1"]')).toHaveCount(2);
});
