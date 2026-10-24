import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

for (const width of [1365, 487]) {
  test(`reader chapter titles follow catalog language at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const initial = emptyData();
    initial.preferences.games = {
      ba: {
        catalogLocale: 'en',
        textLocale: 'ja',
        chaptersOpen: true,
        layout: 'text',
        textSpeed: 0,
      },
    };
    await page.addInitScript((data) => {
      if (!localStorage.getItem('onlystory.v1'))
        localStorage.setItem('onlystory.v1', JSON.stringify(data));
    }, initial);
    await page.goto('/read/ba/ba-jp-10000005');
    const openChapters = async () => {
      if (width < 760)
        await page
          .getByRole('button', { name: 'Chapters', exact: true })
          .click();
    };
    await openChapters();
    const chapters = page.locator('.chapter-list');
    await expect(chapters.locator('strong').first()).toHaveText('Prologue');
    await page
      .getByRole('searchbox', { name: 'Search chapters', exact: true })
      .fill('Welcome to Momoyodou');
    await expect(chapters.locator('strong')).toHaveText([
      'Episode 1 · Welcome to Momoyodou',
    ]);
    if (width < 760)
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page
      .getByRole('button', { name: 'Reader settings', exact: true })
      .click();
    await page.getByRole('tab', { name: 'Language', exact: true }).click();
    await expect(page.getByLabel('Text language', { exact: true })).toHaveValue(
      'ja',
    );
    await page
      .getByLabel('Catalog language', { exact: true })
      .selectOption('original');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await openChapters();
    // Searching English still finds the story when its source title is displayed.
    await expect(chapters.locator('strong')).not.toHaveText([
      'Episode 1 · Welcome to Momoyodou',
    ]);
    await expect(chapters.locator('strong')).toHaveCount(1);
    await page
      .getByRole('searchbox', { name: 'Search chapters', exact: true })
      .fill('');
    await expect(chapters.locator('strong').first()).toHaveText('プロローグ');
    if (width < 760)
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    await openChapters();
    await expect(chapters.locator('strong').first()).toHaveText('プロローグ');
  });
}

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
