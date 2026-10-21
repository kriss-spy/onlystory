import { test, expect } from '@playwright/test';

test('verified titles display by language, search across regions and persist by game', async ({
  page,
}) => {
  await page.goto('/games/pjsk?q=First+Star+After+the+Rain');
  await expect(page.locator('.event-row')).toHaveCount(1);
  await expect(page.locator('.event-row h2')).toHaveText('雨过天晴的启明星');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('Catalog language', { exact: true }).selectOption('en');
  await page.keyboard.press('Escape');
  await expect(page.locator('.event-row h2')).toHaveText(
    'First Star After the Rain',
  );
  await page.reload();
  await expect(page.locator('.event-row h2')).toHaveText(
    'First Star After the Rain',
  );
  await page.locator('.event-row a').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'First Star After the Rain',
  );
  await page.getByLabel('Search stories').fill('ひとりぼっち');
  await expect(page.locator('.story-card h2')).toHaveText('Alone in the Rain');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('Catalog language', { exact: true }).selectOption('ja');
  await page.keyboard.press('Escape');
  await expect(page.locator('.story-card h2')).toHaveText(
    'ひとりぼっちの雨模様',
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page
    .getByLabel('Catalog language', { exact: true })
    .selectOption('zh-CN');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '雨过天晴的启明星',
  );
  await page.goto('/games/ba');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(
    page.getByLabel('Catalog language', { exact: true }),
  ).toHaveValue('original');
});
