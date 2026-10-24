import { expect, test } from '@playwright/test';
import { emptyData } from '../src/model';

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  data.preferences.voiceVolume = 0;
  data.preferences.musicVolume = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
});

test('number keys follow displayed order and left arrow clears the answer before choosing again', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=decision');
  const choices = page.locator('.story-choices > button');
  await expect(choices.first()).toHaveAccessibleName('Stay and listen');
  await expect(choices.first()).toHaveAttribute('aria-keyshortcuts', '1');
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=listen/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/line=decision/);
  expect(new URL(page.url()).searchParams.has('choices')).toBe(false);
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/line=follow/);
  expect(new URL(page.url()).searchParams.get('choices')).toBe(
    '{"decision":"follow"}',
  );
  await page
    .getByRole('button', { name: 'Previous passage', exact: true })
    .click();
  await expect(page).toHaveURL(/line=decision/);
  expect(new URL(page.url()).searchParams.has('choices')).toBe(false);
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=listen/);
});

test('number choices ignore composition, modifiers, text selection, editing, hidden controls and held keys', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=decision');
  await expect(page.locator('.story-choices')).toBeVisible();
  for (const properties of [
    { isComposing: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { repeat: true },
  ]) {
    await page
      .locator('body')
      .dispatchEvent('keydown', { key: '1', code: 'Digit1', ...properties });
    await expect(page).toHaveURL(/line=decision/);
  }
  // Choice passages hide the dialogue window, so select visible header text.
  await page.locator('.reader-header strong').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.getSelection()?.toString().length ?? 0),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=decision/);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=decision/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Chapters', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search chapters' });
  await search.focus();
  await page.keyboard.press('1');
  await expect(search).toHaveValue('1');
  await expect(page).toHaveURL(/line=decision/);
  await search.fill('');
  await page
    .getByRole('button', { name: 'Hide controls', exact: true })
    .click();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=decision/);
  await page
    .getByRole('button', { name: 'Show controls', exact: true })
    .click();
  await page.keyboard.down('1');
  await expect(page).toHaveURL(/line=listen/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/line=decision/);
  await page.keyboard.down('1');
  await expect(page).toHaveURL(/line=decision/);
  await page.keyboard.up('1');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/line=follow/);
});

test('number shortcuts do not bypass the GFL1 keycode interaction', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--58-2-R4?line=-58-2-R4%3A33');
  await expect(page.getByRole('form', { name: 'Keycode lock' })).toBeVisible();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/line=-58-2-R4%3A33/);
  await page.getByLabel('Enter the keycode').fill('9367');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/line=-58-2-R4%3A34/);
});
