import { test, expect } from '@playwright/test';

const dates = (page: import('@playwright/test').Page) =>
  page
    .locator('.event-row time')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('datetime')!),
    );

test('newest release is the default and explicit source/oldest orders survive reload', async ({
  page,
}) => {
  await page.goto('/games/gfl2');
  const order = page.getByRole('combobox', { name: 'Event order' });
  await expect(order).toHaveValue('release-newest');
  await expect(page.locator('.event-row')).toHaveCount(36);
  const newestDates = await dates(page);
  expect(newestDates).toEqual([...newestDates].sort().reverse());
  await order.selectOption('release');
  await expect(page).toHaveURL(/sort=release(?:&|$)/);
  const oldestDates = await dates(page);
  expect(oldestDates).toEqual([...newestDates].sort());
  await page.reload();
  await expect(order).toHaveValue('release');
  await order.selectOption('story');
  await expect(page).toHaveURL(/sort=story/);
  const source = await page.locator('.event-row h2').allTextContents();
  await page.reload();
  await expect(order).toHaveValue('story');
  await expect(page.locator('.event-row h2')).toHaveText(source);
  await order.selectOption('release-newest');
  await expect(page).toHaveURL('/games/gfl2');
  await page.reload();
  await expect(order).toHaveValue('release-newest');
  expect(await dates(page)).toEqual(newestDates);
});

test('category filter omits Side story and old side-story links show all collections', async ({
  page,
}) => {
  await page.goto('/games/gfl2?category=Side+story');
  const category = page.getByRole('combobox', { name: 'Event category' });
  await expect(category).toHaveValue('all');
  await expect(category.locator('option')).toHaveText([
    'All collections',
    'Main story',
    'Event',
  ]);
  await expect(page.locator('.event-row')).toHaveCount(36);
  await expect(
    page.locator('.event-row').filter({ hasText: '伊利昂之围' }),
  ).toContainText('14 side stories');
  await category.selectOption('Event');
  await page.getByRole('searchbox', { name: 'Search events' }).fill('伊利昂');
  await expect(page.locator('.event-row')).toHaveCount(1);
  await page.getByRole('link', { name: /伊利昂之围/ }).click();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(category).toHaveValue('Event');
  await expect(page.getByRole('combobox', { name: 'Event order' })).toHaveValue(
    'release-newest',
  );
  await expect(page.locator('.event-row')).toHaveCount(1);
});
