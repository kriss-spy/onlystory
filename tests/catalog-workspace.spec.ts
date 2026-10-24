import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData } from '../src/model';

const hinaStories = JSON.parse(
  readFileSync('scripts/ba-library.json', 'utf8'),
).filter(
  (story: { collectionId: string }) => story.collectionId === 'ba-jp-event-804',
);

async function expectDesktopWorkspace(page: Page) {
  const sidebar = page.locator('.catalog-sidebar');
  const content = page.locator('.catalog-content');
  await expect(sidebar).toBeVisible();
  await expect(content).toBeVisible();
  await expect(page.locator('.catalog-sidebar-disclosure')).toHaveAttribute(
    'open',
    '',
  );
  const sidebarBox = (await sidebar.boundingBox())!;
  const contentBox = (await content.boundingBox())!;
  expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(contentBox.x);
  expect(Math.abs(sidebarBox.y - contentBox.y)).toBeLessThan(4);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test('catalog and event keep the shared desktop sidebar and return to filtered results', async ({
  page,
}) => {
  await page.goto('/games/gfl1');
  await expectDesktopWorkspace(page);
  await expect(page.locator('.event-row').first()).toBeVisible();
  await page.screenshot({
    path: 'output/design-issue-13/implemented-catalog-desktop.png',
  });
  await page.goto('/games/gfl2?category=Event&sort=release&q=金翅雀');
  await expectDesktopWorkspace(page);
  await expect(page.locator('.event-row')).toHaveCount(1);
  const catalogUrl = page.url();
  await page.getByRole('link', { name: /金翅雀与橄榄枝/ }).click();
  await expect(page).toHaveURL(/\/events\/gfl2-activity33-text/);
  await expectDesktopWorkspace(page);
  await expect(
    page.getByRole('searchbox', { name: 'Search stories' }),
  ).toBeVisible();
  await expect(page.locator('.story-card').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: 'output/design-issue-13/implemented-event-desktop.png',
  });
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(catalogUrl);
  await expect(
    page.getByRole('searchbox', { name: 'Search events' }),
  ).toHaveValue('金翅雀');
  await expect(
    page.getByRole('combobox', { name: 'Event category' }),
  ).toHaveValue('Event');
  await expect(page.getByRole('combobox', { name: 'Event order' })).toHaveValue(
    'release',
  );
  await expect(page.locator('.event-row')).toHaveCount(1);
});

test('narrow catalog keeps search visible and opens collection filters with the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games/gfl2');
  const disclosure = page.locator('.catalog-sidebar-disclosure');
  const summary = disclosure.locator(':scope > summary');
  const category = page.getByRole('combobox', { name: 'Event category' });
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(
    page.getByRole('searchbox', { name: 'Search events' }),
  ).toBeVisible();
  await expect(category).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(category).toBeVisible();
  await category.selectOption('Event');
  await expect(page).toHaveURL(/category=Event/);
  await summary.click();
  await expect(category).not.toBeVisible();
  await expect(page.locator('.event-row').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: 'output/design-issue-13/implemented-catalog-narrow.png',
  });
});

test('event details collapse on a narrow window without hiding story search or results', async ({
  page,
}) => {
  await page.goto('/games/gfl2/events/gfl2-night-platform?examples=1');
  await expectDesktopWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const disclosure = page.locator('.catalog-sidebar-disclosure');
  const summary = disclosure.locator(':scope > summary');
  await expect(disclosure).not.toHaveAttribute('open');
  const search = page.getByRole('searchbox', { name: 'Search stories' });
  await expect(search).toBeVisible();
  await search.fill('signal after');
  await expect(page.locator('[data-story-id="gfl2-2"]')).toBeVisible();
  await expect(page.locator('[data-story-id="gfl2-3"]')).toHaveCount(0);
  await summary.click();
  await expect(disclosure).toHaveAttribute('open', '');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(search).toHaveValue('signal after');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: 'output/design-issue-13/implemented-event-narrow.png',
  });
  await page.setViewportSize({ width: 1365, height: 900 });
  await expectDesktopWorkspace(page);
});

for (const theme of ['light', 'dark'] as const) {
  for (const game of ['gfl1', 'gfl2', 'pjsk', 'ba']) {
    test(`${game} sidebar and cards fit desktop, short, and phone windows in ${theme}`, async ({
      page,
    }) => {
      const data = emptyData();
      data.preferences.theme = theme;
      data.preferences.catalogLayout = 'grid';
      await page.addInitScript(
        (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
        data,
      );
      await page.setViewportSize({ width: 1000, height: 700 });
      await page.goto(`/games/${game}`);
      await expectDesktopWorkspace(page);
      await expect(
        page.locator('.catalog-sidebar select').first(),
      ).toBeVisible();
      const firstEvent = page.locator('.event-row a').first();
      await expect(firstEvent).toBeVisible();
      const eventUrl =
        game === 'ba'
          ? '/games/ba/events/ba-jp-event-804'
          : (await firstEvent.getAttribute('href'))!;
      for (const viewport of [
        { width: 1000, height: 700 },
        { width: 900, height: 400 },
        { width: 320, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(
          page.getByRole('searchbox', { name: 'Search events' }),
        ).toBeVisible();
        await expect(page.getByLabel('Collection layout')).toBeVisible();
        await expect(firstEvent).toBeVisible();
        await expectNoHorizontalOverflow(page);
        for (const row of await page.locator('.event-row').all()) {
          const box = (await row.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
      await page.goto(eventUrl);
      for (const viewport of [
        { width: 1000, height: 700 },
        { width: 900, height: 400 },
        { width: 320, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(
          page.getByRole('searchbox', { name: 'Search stories' }),
        ).toBeVisible();
        await expect(page.getByLabel('Collection layout')).toBeVisible();
        await expect(page.locator('.story-card').first()).toBeVisible();
        await expectNoHorizontalOverflow(page);
        if (viewport.width === 1000) await expectDesktopWorkspace(page);
      }
      if (game === 'ba') {
        await expect(page.locator('.story-card')).toHaveCount(
          hinaStories.length,
        );
        await page.setViewportSize({ width: 1365, height: 900 });
        await page.getByLabel('Collection layout').selectOption('list');
        await expectDesktopWorkspace(page);
        await page.screenshot({
          path: `output/design-issue-13/implemented-ba-event-${theme}.png`,
        });
      }
    });
  }
}
