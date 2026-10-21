import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('BA catalog does not offer unavailable Chinese titles or display an unsupported saved locale as active', async ({
  page,
}) => {
  const initial = emptyData();
  initial.preferences.games = {
    ba: { catalogLocale: 'zh-CN', reducedMotion: true },
  };
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    initial,
  );
  await page.goto('/read/ba/ba-jp-221020');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  const language = page.getByLabel('Catalog language', { exact: true });
  await expect(language).toHaveValue('original');
  await expect(language.locator('option')).toHaveText([
    'Original titles',
    'English',
    '日本語',
  ]);
  await expect(language).toHaveAccessibleDescription(
    /Chinese catalog titles are unavailable for Blue Archive\. Showing original titles\./,
  );
  await expect(page.locator('.reader-header strong')).toHaveText(
    'オリュンポス号の帰還',
  );
  await language.selectOption('en');
  await expect(language).toHaveAccessibleDescription(
    /English titles are unavailable for this story\. Showing its original title\./,
  );
  await page.goto('/games/ba');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(language.locator('option')).toHaveText([
    'Original titles',
    'English',
    '日本語',
  ]);
});
