import { test, expect } from '@playwright/test';

test.setTimeout(60000);
const reader = '/read/ba/ba-jp-11000';
const firstBranch = `${reader}?line=11000%3A190&choices=${encodeURIComponent(JSON.stringify(Object.fromEntries([91, 105, 158, 164, 169].map((row) => [`11000:${row}`, 's0']))))}`;
test('single-response prompts remain clickable', async ({ page }) => {
  await page.goto(`${reader}?line=11000%3A91`);
  const option = page.getByRole('button', { name: '"……？"', exact: true });
  await expect(option).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toBeDisabled();
  await option.click();
  await expect(page).not.toHaveURL(/line=11000%3A91(?:&|$)/);
  await expect(page.locator('.dialogue-window p')).not.toBeEmpty();
});

test('BA catalog, choices, deep links, bookmarks, seeking and end use the ordinary reader', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/games/ba');
  await expect(
    page.getByText('プロローグ', { exact: true }).first(),
  ).toBeVisible({ timeout: 20000 });
  await page.goto(firstBranch);
  await expect(
    page.getByRole('button', { name: '"大丈夫？"', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: '"大丈夫？"', exact: true }).click();
  await expect(page).toHaveURL(/line=11000%3A191/);
  await expect(page.locator('.speaker-row')).toContainText('リン');
  await page.reload();
  await expect(page.locator('.speaker-row')).toContainText('リン');
  await page
    .getByRole('button', { name: 'Bookmark passage', exact: true })
    .click();
  await page.goto(reader);
  await expect(
    page.getByRole('button', { name: 'Remove bookmark', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.dialogue-window p')).toContainText('大丈夫です');
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('0');
  await expect(page).toHaveURL(/line=11000%3A4/);
  await page.goto(firstBranch);
  await page
    .getByRole('button', { name: '"深呼吸でもする？"', exact: true })
    .click();
  await expect(page).toHaveURL(/line=11000%3A192/);
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page.getByRole('button', { name: /私が指揮する/ })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: /私が指揮する/ }).click();
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page.locator('.episode-end')).toContainText('読了', {
    timeout: 20000,
  });
  expect(errors).toEqual([]);
});

test('downloaded BA chapter reopens and seeks while private data requests are blocked', async ({
  page,
}) => {
  await page.goto('/games/ba/events/ba-jp-prologue');
  await page
    .getByRole('button', { name: 'Download プロローグ · 11000', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[
              'ba-jp-11000'
            ],
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.route('**/private/ba-jp/**', (route) => route.abort());
  await page.goto(`${reader}?line=11000%3A35`);
  await expect(page.locator('.reader-gate')).toHaveCount(0);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('5');
  await expect(page).toHaveURL(/line=11000/);
  await expect(page.locator('.dialogue-window p')).not.toBeEmpty();
  await page.reload();
  await expect(page.locator('.dialogue-window p')).not.toBeEmpty();
});

test('Japanese text and reader controls fit a phone viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${reader}?line=11000%3A12`);
  await expect(page.locator('.dialogue-window p')).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.dialogue-window p')).toContainText('プレイヤー');
  await expect(
    page.getByRole('button', { name: 'Reader settings', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  const reveal = page.getByRole('button', { name: 'Reveal text', exact: true });
  if (await reveal.count()) await reveal.click();
  await page.screenshot({ path: testInfo.outputPath('ba-mobile.png') });
});

test('missing and mismatched BA chapters show a recoverable loading error', async ({
  page,
}) => {
  await page.route('**/private/ba-jp/11000/chapter.json*', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto(reader);
  await expect(
    page.getByRole('heading', { name: 'Chapter unavailable' }),
  ).toBeVisible({ timeout: 20000 });
  await page.unrouteAll();
  await page.route('**/private/ba-jp/11000/chapter.json*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ version: 1, id: 'wrong' }),
    }),
  );
  await page.getByRole('button', { name: 'Retry chapter' }).click();
  await expect(
    page.getByText('The BA chapter does not match this library version.'),
  ).toBeVisible({ timeout: 20000 });
});
