import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const boundaries = JSON.parse(
  readFileSync('src/battle-boundaries.json', 'utf8'),
) as { before: string; after: string }[];

async function prepare(page: Page) {
  await page.goto('/read/ba/ba-1?line=arrival');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('0');
  await page
    .getByRole('slider', { name: 'Dialogue size', exact: true })
    .fill('30');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}

test('language shortcuts only select supported text and choice text follows reader size', async ({
  page,
}) => {
  await prepare(page);
  await page.keyboard.press('c');
  await expect(
    page.getByRole('combobox', { name: 'Reading language' }),
  ).toHaveValue('zh-CN');
  await page.keyboard.press('j');
  await expect(
    page.getByRole('combobox', { name: 'Reading language' }),
  ).toHaveValue('zh-CN');
  await page.keyboard.press('e');
  await expect(
    page.getByRole('combobox', { name: 'Reading language' }),
  ).toHaveValue('en');
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stay and listen', exact: true }),
  ).toHaveCSS('font-size', '30px');
  await page.setViewportSize({ width: 487, height: 661 });
  await expect(
    page.getByRole('button', { name: 'Stay and listen', exact: true }),
  ).toHaveCSS('font-size', '30px');
});

test('reader commands preserve copying and hide only the scene UI', async ({
  page,
}) => {
  await prepare(page);
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toContainText('Checkpoint saved.');
  await page.keyboard.press('Control+h');
  await expect(page.getByRole('dialog')).toContainText('History');
  const search = page.getByRole('searchbox', {
    name: 'Search episode history',
  });
  await search.fill('copied text');
  await search.selectText();
  await page.keyboard.press('Control+c');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(search).toHaveValue('copied text');
  await page.keyboard.press('Escape');
  await page.locator('.dialogue-window p').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Control+c');
  await expect(page.locator('.chapter-sidebar')).not.toBeVisible();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.press('Control+c');
  await expect(page.locator('.chapter-sidebar')).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.locator('.dialogue-window')).toBeHidden();
  await expect(page.locator('.reader-header')).toBeVisible();
  await expect(page.locator('.chapter-sidebar')).toBeVisible();
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.locator('.dialogue-window')).toBeVisible();
  await page.getByRole('combobox', { name: 'Reading language' }).focus();
  await page.keyboard.press('F11');
  await expect(page.locator('.reader-page')).toHaveClass(/reader-maximized/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(
    page.getByRole('button', { name: 'Restore reader', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('F11');
  await expect(page.locator('.reader-header')).toBeVisible();
  await page.keyboard.press('Control+,');
  await expect(page.getByRole('dialog')).toContainText('Settings');
});

test('History includes optional unread text and replaces the transcript command', async ({
  page,
}) => {
  await prepare(page);
  await page.keyboard.press('Control+h');
  await expect(page.locator('.history-unread')).toHaveCount(0);
  await page
    .getByRole('checkbox', {
      name: 'Include unread passages and alternate branches',
    })
    .check();
  await expect(page.locator('.history-unread').first()).toContainText('Unread');
  await page
    .getByRole('searchbox', { name: 'Search episode history' })
    .fill('Take the light');
  await expect(page.locator('.history-unread')).toContainText('Take the light');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Find a command' })
    .fill('transcript');
  await expect(page.getByText('No matching commands.')).toBeVisible();
});

test('direct entry after a source battle boundary displays a notice', async ({
  page,
}) => {
  await page.goto(`/read/ba/${boundaries[0].after}`);
  await expect(page.locator('.battle-notice')).toContainText(
    'This story continues after the battle.',
  );
  const group = boundaries[0].before.replace('ba-jp-', '');
  const response = await page.request.get(
    `/private/ba-jp/${group}/chapter.json`,
  );
  const chapter = (await response.json()) as {
    nodes: { id: string; choices?: { id: string }[] }[];
  };
  const answers = Object.fromEntries(
    chapter.nodes
      .filter((node) => node.choices?.length)
      .map((node) => [node.id, node.choices![0].id]),
  );
  await page.goto(
    `/read/ba/${boundaries[0].before}?line=${group}%3Aend&choices=${encodeURIComponent(JSON.stringify(answers))}`,
  );
  await expect(page.locator('.battle-notice')).toContainText(
    'The next story continues after the battle.',
  );
});
