import { test, expect } from '@playwright/test';

test('Goldfinch story names include source codes and distinguish battle halves on existing links', async ({
  page,
}) => {
  await page.goto('/games/gfl2/events/gfl2-activity33-text');
  await expect(page.locator('.story-card')).toHaveCount(24);
  await page.getByRole('link', { name: /CA-1-1 精英姿态 · 战前/ }).click();
  await expect(page).toHaveURL(/\/read\/gfl2\/gfl2-event-3470411/);
  await expect(page.locator('.reader-header strong')).toHaveText(
    'CA-1-1 精英姿态 · 战前',
  );
  await page.goto('/read/gfl2/gfl2-event-3470421');
  await expect(page.locator('.reader-header strong')).toHaveText(
    'CA-1-1 精英姿态 · 战后',
  );
  await page.goto('/manage');
  await expect(
    page.getByRole('link', { name: 'CA-1-1 精英姿态 · 战前', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'CA-1-1 精英姿态 · 战后', exact: true }),
  ).toBeVisible();
});

test('real game opens events before stories, with direct links and a return to the event', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/gfl2-event/readers/'))
      requests.push(request.url());
  });
  await page.goto('/games/gfl2');
  await expect(page.getByText('36 events', { exact: true })).toBeVisible();
  await expect(page.locator('.event-row')).toHaveCount(36);
  await page.screenshot({ path: 'private-review/events/gfl2-events.png' });
  await page.getByRole('link', { name: /金翅雀与橄榄枝/ }).click();
  await expect(page).toHaveURL(/\/games\/gfl2\/events\/gfl2-activity33-text/);
  await expect(page.locator('.story-card')).toHaveCount(24);
  await page.screenshot({ path: 'private-review/events/gfl2-stories.png' });
  expect(requests).toHaveLength(0);
  const eventUrl = page.url();
  const second = await context.newPage();
  await second.goto(eventUrl);
  await expect(
    second.getByRole('heading', { name: '金翅雀与橄榄枝', exact: true }),
  ).toBeVisible();
  await second.close();
  await page
    .getByRole('link', { name: /Main story · 01 CS-1-1 长梦初醒/ })
    .click();
  await expect(page.locator('.dialogue-window')).toContainText('2074年');
  expect(requests).toHaveLength(1);
  await page
    .getByRole('link', { name: 'Back to stories', exact: true })
    .click();
  await expect(page).toHaveURL(eventUrl);
  await expect(page.locator('.story-card')).toHaveCount(24);
});

test('side-story branches are indented, searchable, and keep their own continuation', async ({
  page,
}) => {
  await page.goto('/games/gfl2?examples=1');
  await page.getByRole('link', { name: /Night platform/ }).click();
  const main = page.locator('[data-story-id="gfl2-1"]');
  const side = page.locator('[data-story-id="gfl2-2"]');
  const mainBox = await main.boundingBox();
  const sideBox = await side.boundingBox();
  expect(sideBox!.x).toBeGreaterThan(mainBox!.x + 20);
  await page
    .getByRole('searchbox', { name: 'Search stories' })
    .fill('signal after');
  await expect(main).toBeVisible();
  await expect(side).toBeVisible();
  await expect(page.locator('[data-story-id="gfl2-3"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('signal after');
  // The main story must finish without forcing the reader into its side branch.
  await page.goto(
    '/read/gfl2/gfl2-1?line=morning&choices=%7B%22decision%22%3A%22follow%22%7D',
  );
  await expect(page.locator('.episode-end')).toBeVisible();
  await expect(page.getByRole('link', { name: /Next section/ })).toHaveCount(0);
});

test('returning from a later real chapter restores event scroll and game search', async ({
  page,
}) => {
  await page.goto('/games/gfl2?q=%E9%87%91%E7%BF%85%E9%9B%80');
  await page.getByRole('link', { name: /金翅雀与橄榄枝/ }).click();
  await page.locator('.event-outline').evaluate((el) => {
    el.scrollTop = 116 * 10;
  });
  await page
    .locator('[data-story-id="gfl2-event-3470521"] .story-card-link')
    .click();
  await expect(page.locator('.reader-header strong')).toHaveText(
    'CA-1-5 身不由己 · 战后',
  );
  await page
    .getByRole('link', { name: 'Back to stories', exact: true })
    .click();
  await expect
    .poll(() => page.locator('.event-outline').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(1000);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search events' }),
  ).toHaveValue('金翅雀');
});

test('a side story without a timeline anchor appears in its own section', async ({
  page,
}) => {
  await page.goto('/games/pjsk/events/pjsk-night-platform?examples=1');
  const independent = page.getByRole('list', {
    name: 'Side stories outside the main timeline',
  });
  await expect(
    page.getByRole('heading', { name: 'Outside the main timeline' }),
  ).toBeVisible();
  await expect(independent.locator('[data-story-id="pjsk-3"]')).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Event stories' })
      .locator('[data-story-id="pjsk-3"]'),
  ).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`${theme} event layout keeps side stories reachable at phone width`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/games/gfl2/events/gfl2-night-platform?examples=1');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Appearance', exact: true })
      .selectOption(theme);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('.story-card')).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const card of await page.locator('.story-card').all()) {
      const box = await card.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    await page.screenshot({
      path: testInfo.outputPath(`event-${theme}-phone.png`),
    });
  });
}
