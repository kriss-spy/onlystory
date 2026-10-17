import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import corpus from '../docs/pjsk-all-events.json' with { type: 'json' };
import main from '../docs/pjsk-main-corpus.json' with { type: 'json' };
import { pjskGroups } from '../src/pjsk-groups';

const unavailable = new Set<string>(
  JSON.parse(
    readFileSync('.cache/pjsk/all-events-validation/availability.json', 'utf8'),
  ).events.map((event: { eventId: string }) => event.eventId),
);
const events = corpus.events.filter((event) => !unavailable.has(event.eventId));
const eventGroup = (event: (typeof events)[number]) => {
  const focus = [
    ...new Set(
      event.storyUnits
        .filter((row) => row.eventStoryUnitRelation === 'main')
        .map((row) => row.unit),
    ),
  ];
  const all = [...new Set(event.storyUnits.map((row) => row.unit))];
  return focus.length === 1 ? focus[0] : all.length > 1 ? 'mixed' : all[0];
};
const groupCount = (id: string, category = 'all') =>
  (category !== 'Event'
    ? main.groups.filter((group) => group.collection === id).length
    : 0) +
  (category !== 'Main story'
    ? events.filter((event) => eventGroup(event) === id).length
    : 0);
const total = events.length + main.groups.length;
const newestEvent = [...events].sort((a, b) => b.startAt - a.startAt)[0];
const newestLink = new RegExp(`/pjsk-cn-event-${newestEvent.eventId}(?:[?]|$)`);
async function countResults(page: Page, count: number) {
  await expect(page.locator('.section-title .muted')).toHaveText(
    `${count.toLocaleString()} ${count === 1 ? 'event' : 'events'}`,
  );
  const rows = page.locator('.event-row');
  if (count > 80) {
    await expect.poll(() => rows.count()).toBeGreaterThan(0);
    expect(await rows.count()).toBeLessThan(40);
    expect(await rows.count()).toBeLessThan(count);
  } else await expect(rows).toHaveCount(count);
}
async function scrollEnd(page: Page, end: 'top' | 'bottom') {
  await page.locator('.catalog-scroll').evaluate((el, end) => {
    el.scrollTop = end === 'top' ? 0 : el.scrollHeight;
  }, end);
}
const collectionPath = (url: string) =>
  new URL(url, 'http://localhost').pathname;

test('PJSK virtual catalog keeps main stories oldest in both release sort directions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1163, height: 800 });
  await page.goto('/games/pjsk?sort=release');
  await countResults(page, total);
  const links = page.locator('.event-row > a');
  await expect(links.first()).toHaveAttribute('href', /-main/);
  expect(
    (
      await links.evaluateAll((elements) =>
        elements.slice(0, 6).map((el) => el.getAttribute('href')!),
      )
    ).every((link) => link.includes('-main')),
  ).toBe(true);
  await scrollEnd(page, 'bottom');
  await expect(links.last()).toHaveAttribute('href', newestLink);
  const oldestBottom = collectionPath(
    (await links.last().getAttribute('href'))!,
  );
  await expect(page.locator('.event-row')).not.toHaveCount(total);
  await page
    .getByRole('combobox', { name: 'Event order' })
    .selectOption('release-newest');
  await countResults(page, total);
  await expect(links.first()).toHaveAttribute('href', newestLink);
  expect(collectionPath((await links.first().getAttribute('href'))!)).toBe(
    oldestBottom,
  );
  await scrollEnd(page, 'bottom');
  await expect
    .poll(async () => links.last().getAttribute('href'))
    .toMatch(/-main/);
  expect(
    (
      await links.evaluateAll((elements) =>
        elements.slice(-6).map((el) => el.getAttribute('href')!),
      )
    ).every((link) => link.includes('-main')),
  ).toBe(true);
  await scrollEnd(page, 'top');
  await expect(links.first()).toHaveAttribute('href', newestLink);
  await page.reload();
  await countResults(page, total);
  await expect(page.getByRole('combobox', { name: 'Event order' })).toHaveValue(
    'release-newest',
  );
});

test('source-derived PJSK group counts combine with category, navigation and reload', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1163, height: 800 });
  await page.goto('/games/pjsk?sort=release');
  const group = page.getByRole('combobox', { name: 'Story group' });
  const category = page.getByRole('combobox', { name: 'Event category' });
  const links = page.locator('.event-row > a');
  await group.selectOption('idol');
  await countResults(page, groupCount('idol'));
  await expect(links.first()).toHaveAttribute('href', /pjsk-cn-idol-main/);
  await expect(page).toHaveURL(/group=idol/);
  await category.selectOption('Event');
  await countResults(page, groupCount('idol', 'Event'));
  await page.reload();
  await expect(group).toHaveValue('idol');
  await expect(category).toHaveValue('Event');
  await countResults(page, groupCount('idol', 'Event'));
  await links.first().click();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(group).toHaveValue('idol');
  await expect(page.getByRole('combobox', { name: 'Event order' })).toHaveValue(
    'release',
  );
  await category.selectOption('all');
  for (const { id } of pjskGroups) {
    await group.selectOption(id);
    await countResults(page, groupCount(id));
  }
  await group.selectOption('all');
  await countResults(page, total);
  await page.screenshot({ path: testInfo.outputPath('groups-desktop.png') });
  await page.setViewportSize({ width: 320, height: 780 });
  await expect(group).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await countResults(page, total);
  await scrollEnd(page, 'bottom');
  await expect(links.last()).toHaveAttribute('href', newestLink);
  await page.screenshot({ path: testInfo.outputPath('groups-mobile.png') });
});
