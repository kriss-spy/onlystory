import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';
import baStories from '../src/generated/ba-stories.json' with { type: 'json' };

for (const [game, language] of [
  ['gfl1', 'EN'],
  ['gfl2', 'CN'],
  ['pjsk', 'CN'],
  ['ba', 'JP'],
] as const) {
  test(`${game} shows dialogue language labels in every catalog layout and event detail`, async ({
    page,
  }) => {
    await page.goto(`/games/${game}`);
    for (const layout of ['list', 'grid', 'table']) {
      await page.getByLabel('Collection layout').selectOption(layout);
      const row = page.locator('.event-row').first();
      await expect(row).toBeVisible();
      const languages = row.getByRole('group', {
        name: 'Supported text languages',
      });
      await expect(languages).toBeVisible();
      await expect(languages).toContainText('Text:');
      await expect(
        languages.locator('.text-language').filter({ hasText: language }),
      ).toBeVisible();
    }
    const row = page.locator('.event-row').first();
    const badges = await row.locator('.text-language').allTextContents();
    await row.locator('a').first().click();
    await expect(page.locator('.event-heading .text-language')).toHaveText(
      badges,
    );
  });
}

const groups = Map.groupBy(baStories, (story) => story.collectionId);
const japaneseOnly = baStories.find((story) => story.id === 'ba-jp-211010')!;
const partial = [...groups.entries()].find(([, stories]) => {
  const english = stories.filter((story) =>
    story.textLocales.includes('en'),
  ).length;
  return english > 0 && english < stories.length;
})!;

test('BA labels distinguish Japanese-only and partial English coverage, and wrap on narrow screens', async ({
  page,
}, info) => {
  const initial = emptyData();
  initial.preferences.theme = 'light';
  await page.addInitScript((data) => {
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, initial);
  await page.goto(`/games/ba/events/${japaneseOnly.collectionId}`);
  await expect(page.locator('.event-heading .text-language')).toHaveText([
    'JP',
  ]);
  const [id, stories] = partial;
  const english = stories.filter((story) =>
    story.textLocales.includes('en'),
  ).length;
  await page.goto(`/games/ba/events/${id}`);
  const badges = page.locator('.event-heading .text-language');
  await expect(badges).toHaveText([
    `EN · ${english}/${stories.length} stories`,
    'JP',
  ]);
  await page.screenshot({ path: info.outputPath('event-languages-light.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(badges.first()).toBeVisible();
  const bounds = await page
    .locator('.event-heading .text-languages')
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: innerWidth };
    });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  await page.screenshot({
    path: info.outputPath('event-languages-narrow-light.png'),
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.keyboard.press('Escape');
  await expect(badges).toHaveText([
    `EN · ${english}/${stories.length} stories`,
    'JP',
  ]);
  await page.screenshot({
    path: info.outputPath('event-languages-narrow-dark.png'),
  });
  await page.setViewportSize({ width: 1079, height: 826 });
  await page.goto('/games/ba?category=Main+story&sort=story');
  await expect(
    page.locator('.event-row .text-languages').first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('event-languages-catalog.png'),
  });
});
