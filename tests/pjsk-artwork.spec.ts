import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import corpus from '../docs/pjsk-all-events.json' with { type: 'json' };
import main from '../docs/pjsk-main-corpus.json' with { type: 'json' };

const unavailable = new Set<string>(
  JSON.parse(
    readFileSync('.cache/pjsk/all-events-validation/availability.json', 'utf8'),
  ).events.map((event: { eventId: string }) => event.eventId),
);
const events = corpus.events.filter((event) => !unavailable.has(event.eventId));
const newestEvent = [...events].sort((a, b) => b.startAt - a.startAt)[0];
async function decoded(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('.event-cover, .group-mark img')
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) => (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  const rows = page.locator('.event-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator('.event-cover')).toHaveCount(await rows.count());
  await expect(rows.locator('.group-mark')).toHaveCount(await rows.count());
  await expect(page.locator('.event-number')).toHaveCount(0);
}
async function bottom(page: Page) {
  await page.locator('.catalog-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

test('original PJSK covers and accessible native group marks decode across the virtual catalog', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1163, height: 800 });
  await page.goto('/games/pjsk?sort=release');
  await expect(
    page.getByText(`${events.length + main.groups.length} events`, {
      exact: true,
    }),
  ).toBeVisible();
  await decoded(page);
  expect(await page.locator('.event-row').count()).toBeLessThan(40);
  await expect(
    page
      .locator('.event-row')
      .filter({ hasText: 'MORE MORE JUMP! · 主线故事' })
      .getByRole('img', { name: 'MORE MORE JUMP! (MMJ)', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  await bottom(page);
  await expect(page.locator('.event-row > a').last()).toHaveAttribute(
    'href',
    new RegExp(`/pjsk-cn-event-${newestEvent.eventId}(?:[?]|$)`),
  );
  await decoded(page);
  await page
    .getByRole('combobox', { name: 'Story group' })
    .selectOption('mixed');
  await page
    .getByRole('combobox', { name: 'Event category' })
    .selectOption('Event');
  const mixedCount = events.filter(
    (event) =>
      !event.storyUnits.some((row) => row.eventStoryUnitRelation === 'main') &&
      new Set(event.storyUnits.map((row) => row.unit)).size > 1,
  ).length;
  await expect(
    page.getByRole('img', { name: 'Mixed groups', exact: true }),
  ).toHaveCount(mixedCount);
  await decoded(page);
  await page.locator('.event-row > a').first().click();
  await expect(page.locator('.event-heading-cover')).toBeVisible();
  await expect(page.locator('.event-summary .group-mark')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.event-heading-cover')
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('collection.png') });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/games/pjsk?sort=release-newest');
  await decoded(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await bottom(page);
  await expect
    .poll(async () =>
      page.locator('.event-row > a').last().getAttribute('href'),
    )
    .toMatch(/-main/);
  await decoded(page);
  const fits = await page.locator('.event-row').evaluateAll((rows) =>
    rows.every((row) => {
      const rect = row.getBoundingClientRect(),
        info = row.querySelector('.event-info')!.getBoundingClientRect();
      return info.top >= rect.top && info.bottom <= rect.bottom;
    }),
  );
  expect(
    fits,
    'Card titles and group marks fit inside virtual mobile rows',
  ).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png') });
});
