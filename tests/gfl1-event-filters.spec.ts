import { test, expect } from '@playwright/test';

test('GFL1 event types combine with search and survive reload and return navigation', async ({
  page,
}) => {
  await page.goto('/games/gfl1?sort=release');
  const category = page.getByRole('combobox', { name: 'Story type' });
  const type = category;
  const titles = page.locator('.event-row h2');
  await expect(category).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Collection layout' }),
  ).toBeVisible();
  await category.selectOption('Event');
  await expect(titles).toHaveCount(46);
  await expect(
    type.locator('option[value="event:collaboration"]'),
  ).toBeEnabled();
  await type.selectOption('event:collaboration');
  await expect(titles).toHaveCount(9);
  await expect(titles.first()).toHaveText('Operation Rabbit Hunt');
  await page.reload();
  await expect(type).toHaveValue('event:collaboration');
  await expect(titles).toHaveCount(9);
  await type.selectOption('event:special');
  await expect(titles).toHaveCount(12);
  await expect(titles.first()).toHaveText('Freaky Pandemic');
  await page.reload();
  await expect(type).toHaveValue('event:special');
  await expect(titles).toHaveCount(12);
  await page.locator('.event-row a').first().click();
  await page.goBack();
  await expect(type).toHaveValue('event:special');
  await type.selectOption('event:story');
  await expect(titles).toHaveCount(25);
  await expect(titles.first()).toHaveText('Operation Cube');
  const search = page.getByRole('searchbox', { name: 'Search events' });
  await search.fill('Singularity');
  await expect(titles.filter({ hasText: /^Singularity$/ })).toHaveCount(1);
  await type.selectOption('event:special');
  await expect(titles).toHaveCount(0);
  await search.fill('');
  await category.selectOption('Main story');
  await expect(category).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Collection layout' }),
  ).toBeVisible();
  await expect(titles).toHaveCount(14);
  await expect(page).not.toHaveURL(/eventType=/);
  await category.selectOption('Event');
  await expect(type).toHaveValue('Event');
  await expect(titles).toHaveCount(46);
  await page.goto('/games/gfl2?category=Event&eventType=special&examples=1');
  await expect(
    page.getByRole('combobox', { name: 'Event category' }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Collection layout' }),
  ).toBeVisible();
});
