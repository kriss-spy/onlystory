import { test, expect, type Page } from '@playwright/test';
import { emptyData } from '../src/model';

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  data.preferences.voiceVolume = 0;
  data.preferences.musicVolume = 0;
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
});

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
}

test('BA main story keeps story order separate from complete JP release order', async ({
  page,
}) => {
  await page.goto('/games/ba?category=Main+story');
  const order = page.getByLabel('Event order');
  const rows = page.locator('.event-row');
  await expect(order).toHaveValue('story');
  await expect(rows.first().locator('a')).toHaveAttribute(
    'href',
    '/games/ba/events/ba-jp-prologue',
  );
  await order.selectOption('release-newest');
  await expect(order).toHaveValue('release-newest');
  await expect(rows.first().locator('a')).toHaveAttribute(
    'href',
    '/games/ba/events/ba-jp-main-series2-v3-c1',
  );
  await expect(
    page.getByText('Release date unavailable', { exact: true }),
  ).toHaveCount(0);
  const newest = await rows.locator('time').allTextContents();
  expect(newest).toEqual([...newest].sort().reverse());
  await order.selectOption('release');
  await expect(rows.first().locator('a')).toHaveAttribute(
    'href',
    '/games/ba/events/ba-jp-prologue',
  );
  const oldest = await rows.locator('time').allTextContents();
  expect(oldest).toEqual([...oldest].sort());
  await order.selectOption('release-newest');
  await page.reload();
  await expect(order).toHaveValue('release-newest');
  expect(await rows.locator('time').allTextContents()).toEqual(newest);
});

test('catalog layouts persist, fit narrow windows, and virtualize card rows', async ({
  page,
}, info) => {
  await page.goto('/games/ba');
  await page.getByLabel('Collection layout').selectOption('grid');
  const rows = page.locator('.event-row');
  await expect(rows.first()).toBeVisible();
  const boxes = await rows.evaluateAll((rows) =>
    rows.slice(0, 2).map((row) => ({
      x: row.getBoundingClientRect().x,
      y: row.getBoundingClientRect().y,
    })),
  );
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
  expect(boxes[1].y).toBe(boxes[0].y);
  await page.screenshot({ path: info.outputPath('cards-desktop.png') });
  await page.locator('.catalog-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      rows.first().evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThan(800);
  await page.reload();
  await expect(page.getByLabel('Collection layout')).toHaveValue('grid');
  for (const viewport of [
    { width: 760, height: 700 },
    { width: 320, height: 640 },
    { width: 900, height: 400 },
  ]) {
    await page.setViewportSize(viewport);
    await fits(page);
    await expect(page.getByLabel('Search events')).toBeVisible();
    await expect(page.getByLabel('Collection layout')).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByLabel('Collection layout').selectOption('table');
  await expect(page.locator('.event-row .event-cover')).toHaveCount(0);
  await page.getByLabel('Event order').selectOption('title');
  await page.getByLabel('Search events').fill('no-such-collection-xyz');
  await expect(
    page.getByText('No matching events', { exact: true }),
  ).toBeVisible();
  await fits(page);
  await page.screenshot({ path: info.outputPath('catalog-mobile.png') });
});

test('settings tabs follow the current game and persist appearance independently', async ({
  page,
}, info) => {
  await page.goto('/games/ba');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Reading', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Game settings', { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Reading', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Appearance', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.getByLabel('Game theme', { exact: true }).selectOption('ba');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.getByRole('dialog')).toHaveCSS(
    'background-color',
    'rgb(29, 39, 43)',
  );
  await expect(
    page.getByRole('slider', { name: 'Dialogue opacity', exact: true }),
  ).toHaveValue('0');
  await page.screenshot({ path: info.outputPath('settings-dark.png') });
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('Player name', { exact: true }).fill('Sensei');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'ba');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/games/gfl2');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'default');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(page.getByLabel('Player name', { exact: true })).not.toHaveValue(
    'Sensei',
  );
  await page.getByLabel('Player name', { exact: true }).fill('Commander');
  await page.keyboard.press('Escape');
  await page.goto('/games/ba');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(page.getByLabel('Player name', { exact: true })).toHaveValue(
    'Sensei',
  );
  await expect(
    page.getByLabel('Protagonist version', { exact: true }),
  ).toHaveCount(0);
});

test('BA dialogue opacity changes only its background and persists for the current game', async ({
  page,
}, info) => {
  await page.goto('/read/ba/ba-1?line=arrival');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page.getByLabel('Game theme', { exact: true }).selectOption('ba');
  const opacity = page.getByRole('slider', {
    name: 'Dialogue opacity',
    exact: true,
  });
  await expect(opacity).toHaveValue('0');
  const dialogue = page.locator('.dialogue-window');
  await expect(dialogue).toHaveCSS('opacity', '1');
  const background = () =>
    dialogue.evaluate((element) => getComputedStyle(element).backgroundColor);
  const transparent = await background();
  expect(transparent).toMatch(/\/ 0\)|rgba\(.+, 0\)/);
  await opacity.fill('0.6');
  expect(await background()).not.toBe(transparent);
  await page.keyboard.press('Escape');
  await page.reload();
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(opacity).toHaveValue('0.6');
  await page.setViewportSize({ width: 320, height: 700 });
  await fits(page);
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await expect(page.getByLabel('Voice volume', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('settings-appearance-phone.png'),
  });
  await page.keyboard.press('Escape');
  await page.goto('/read/gfl2/gfl2-1');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(opacity).toHaveValue('1');
});

test('reader defaults to compact settings and seeking stops at choices', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=arrival');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  expect(Number(await position.getAttribute('max'))).toBeGreaterThan(2);
  const marks = page.locator('.choice-markers span');
  await expect(marks).toHaveCount(1);
  const markerLayer = await page
    .locator('.choice-markers')
    .evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(markerLayer).toBeGreaterThan(
    await position.evaluate((element) =>
      Number(getComputedStyle(element).zIndex),
    ),
  );
  const marker = await marks.first().boundingBox();
  const track = await page.locator('.story-progress').boundingBox();
  expect(marker!.y + marker!.height / 2).toBeCloseTo(
    track!.y + track!.height / 2,
    1,
  );
  await position.focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/line=decision$/);
  await expect(position).toHaveValue('2');
  await page
    .getByRole('button', { name: 'Follow the signal', exact: true })
    .click();
  await expect(marks).toHaveCount(1);
  await position.focus();
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/line=arrival$/);
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/line=morning/);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await expect(page.getByLabel('Layout', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Player name', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(page.getByLabel('Player name', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const url = page.url();
  await page
    .getByRole('combobox', { name: 'Reading language' })
    .selectOption('zh-CN');
  await expect(page).toHaveURL(url);
  await expect(page.locator('.dialogue-window p')).toContainText('影像结束时');
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(
    page.getByRole('combobox', { name: 'Reading language' }),
  ).toBeVisible();
  await fits(page);
  await page.goto('/read/gfl2/gfl2-event-3478101');
  await expect(
    page.getByRole('combobox', { name: 'Reading language' }),
  ).toHaveCount(0);
});

test('download progress advances through files and supports cancel and retry', async ({
  page,
}) => {
  await page.route('**/demo/**', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({ response });
  });
  await page.goto('/manage?examples=1');
  await page.getByLabel('Search downloads').fill('A signal after midnight');
  const row = page.locator('.download-item').first();
  await row.getByRole('button', { name: /^Download / }).click();
  const progress = row.getByRole('progressbar');
  await expect(progress).toBeVisible();
  await expect
    .poll(() => progress.getAttribute('value').then(Number))
    .toBeGreaterThan(0);
  await row.getByRole('button', { name: /^Cancel download/ }).click();
  await expect(row).toContainText('Download canceled');
  await row.getByRole('button', { name: /^Download / }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'is available on this device' }),
  ).toBeVisible();
  await page.goto('/manage?examples=1');
  await page.getByLabel('Search downloads').fill('A signal after midnight');
  await expect(page.locator('.download-item').first()).toContainText(
    'On this device',
  );
});
