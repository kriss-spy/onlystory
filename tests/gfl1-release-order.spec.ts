import { test, expect } from '@playwright/test';

test('main-story newest first reverses chapters sharing a release date', async ({
  page,
}) => {
  await page.goto('/games/gfl1?category=Main+story&sort=release');
  const titles = page.locator('.event-row h2');
  await expect(titles).toHaveCount(14);
  const oldest = await titles.allTextContents();
  expect(
    oldest.map((title) => Number(title.match(/^Chapter (\d+)/)![1])),
  ).toEqual(Array.from({ length: 14 }, (_, index) => index));
  await page
    .getByRole('combobox', { name: 'Event order' })
    .selectOption('release-newest');
  await expect(titles).toHaveText([...oldest].reverse());
  await page.reload();
  await expect(titles).toHaveText([...oldest].reverse());
  await page
    .getByRole('combobox', { name: 'Event order' })
    .selectOption('story');
  await expect(titles).toHaveText(oldest);
});

test('GFL1 release sorting changes direction and interleaves seasonal events by English release', async ({
  page,
}) => {
  await page.goto('/games/gfl1?sort=release');
  const rows = page.locator('.event-row h2');
  await expect(rows).toHaveCount(60);
  const oldest = await rows.allTextContents();
  expect(oldest[0]).toContain('Chapter 0');
  expect(oldest.at(-1)).toBe('Quantum Fluctuations');
  expect(oldest.indexOf('Freaky Pandemic')).toBeGreaterThan(
    oldest.indexOf('Blindfold Theorem'),
  );
  expect(oldest.indexOf('Freaky Pandemic')).toBeLessThan(
    oldest.indexOf('Singularity'),
  );
  expect(oldest.indexOf('Deep Dive')).toBeLessThan(
    oldest.indexOf('Blindfold Theorem'),
  );
  expect(oldest.indexOf('Eclipses & Saros')).toBeLessThan(
    oldest.indexOf('Longitudinal Strain'),
  );
  expect(oldest.indexOf('One Coin Short')).toBeLessThan(
    oldest.indexOf('Waves Wrangler'),
  );
  await page
    .getByRole('combobox', { name: 'Event order' })
    .selectOption('release-newest');
  await expect(rows.first()).toHaveText('Quantum Fluctuations');
  const newest = await rows.allTextContents();
  expect(newest).toEqual([...oldest].reverse());
  await expect(page.locator('.event-row time')).toHaveCount(60);
  await page.reload();
  await expect(rows.first()).toHaveText('Quantum Fluctuations');
  await page
    .getByRole('combobox', { name: 'Event order' })
    .selectOption('story');
  await expect(rows.first()).toContainText('Chapter 0');
  const native = await rows.allTextContents();
  expect(native.indexOf('Freaky Pandemic')).toBeGreaterThan(
    native.indexOf('Quantum Fluctuations'),
  );
});
