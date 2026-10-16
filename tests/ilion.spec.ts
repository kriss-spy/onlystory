import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { plainText } from '../src/playback/gfl2/text';

const event = JSON.parse(readFileSync('src/generated/gfl2-ilion.json', 'utf8'));
const route = '/games/gfl2/events/gfl2-ilion';
const sections = event.sections as {
  id: string;
  title: string;
  firstNode: string;
  lastNode: string;
  contentUrl: string;
  placement?: { after?: string };
  chapter: { id: string };
}[];
const readerUrl = (
  section: (typeof sections)[number],
  line = section.firstNode,
) => `/read/gfl2/${section.id}?line=${encodeURIComponent(line)}`;

test('Ilion chapters fold within one event, remember choices, and search exposes real side branches', async ({
  page,
}) => {
  await page.goto('/games/gfl2');
  await page.getByRole('link', { name: /伊利昂之围/ }).click();
  await expect(page).toHaveURL(new RegExp(`${route}$`));
  await expect(page.locator('.chapter-toggle')).toHaveCount(3);
  const upper = page.getByRole('button', { name: /上篇/ });
  const middle = page.getByRole('button', { name: /中篇/ });
  await expect(upper).toHaveAttribute('aria-expanded', 'true');
  await expect(middle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.story-card')).toHaveCount(24);
  await upper.click();
  await middle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.story-card')).toHaveCount(25);
  await expect(page.locator('[data-story-kind="side"]')).toHaveCount(8);
  await page.reload();
  await expect(middle).toHaveAttribute('aria-expanded', 'true');
  await expect(upper).toHaveAttribute('aria-expanded', 'false');
  await page
    .getByRole('searchbox', { name: 'Search stories' })
    .fill('毒蛇的獠牙');
  await expect(page.locator('.story-card')).toHaveCount(2);
  await expect(
    page.getByRole('link', { name: /AA-1-1 锋线对弈/ }),
  ).toBeVisible();
  const main = await page
    .locator('[data-story-kind="main"] .story-card')
    .boundingBox();
  const side = await page
    .locator('[data-story-kind="side"] .story-card')
    .boundingBox();
  expect(side!.x).toBeGreaterThan(main!.x + 20);
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('.story-card')).toHaveCount(25);
  await page.screenshot({ path: 'private-review/events/ilion-chapters.png' });
});

test('real Ilion side sequence continues within its branch and main route bypasses it', async ({
  page,
}) => {
  const sideA = sections.find((section) => section.title.includes('AE-2-3'))!;
  const sideB = sections.find((section) => section.title.includes('AE-2-4'))!;
  const anchor = sections.find(
    (section) => section.id === sideA.placement?.after,
  )!;
  await page.goto(readerUrl(sideA, sideA.lastNode));
  await expect(page.locator('.episode-end')).toBeVisible();
  await page.getByRole('link', { name: /Next section/ }).click();
  await expect(page.locator('.reader-header strong')).toHaveText(sideB.title);
  await page.goto(readerUrl(sideB, sideB.lastNode));
  await expect(page.getByRole('link', { name: /Next section/ })).toHaveCount(0);
  await page.goto(readerUrl(anchor, anchor.lastNode));
  await expect(
    page.getByRole('link', { name: /Next section/ }),
  ).not.toContainText('AE-');
});

test('a fresh event visit expands the chapter containing the saved passage', async ({
  page,
}) => {
  const lower = sections.find((section) => section.title.includes('AE-2-3'))!;
  await page.goto(readerUrl(lower, lower.lastNode));
  await expect(page.locator('.episode-end')).toBeVisible();
  await page
    .getByRole('link', { name: 'Back to stories', exact: true })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /下篇/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('button', { name: /上篇/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('all 65 Ilion stories load their real final passage without runtime errors', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const section of sections) {
    const data = JSON.parse(
      readFileSync(
        `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
        'utf8',
      ),
    );
    await page.goto(readerUrl(section, section.lastNode));
    await expect(page.locator('.reader-header strong')).toHaveText(
      section.title,
    );
    await expect(page.locator('.dialogue-window p')).toHaveText(
      plainText(data.passages.at(-1).text).replaceAll('{}', '指挥官'),
    );
    await expect(page.locator('.episode-end')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('Ilion opening plays the original movie and can continue into the original scene', async ({
  page,
}) => {
  await page.goto(readerUrl(sections[0]));
  const movie = page.getByLabel('Story movie', { exact: true });
  await expect(movie).toBeVisible();
  await expect(page.locator('.dialogue-window')).toBeHidden();
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  const info = await movie.evaluate((video: HTMLVideoElement) => ({
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration,
  }));
  expect(info.width).toBe(2560);
  expect(info.height).toBe(1440);
  expect(info.duration).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Skip this movie' }).click();
  await expect(page.locator('.dialogue-window')).toBeVisible();
  await expect(page.locator('.event-canvas canvas')).toBeVisible();
  await page.screenshot({ path: 'private-review/events/ilion-scene.png' });
});

for (const theme of ['light', 'dark']) {
  test(`${theme} Ilion chapter sections and branches fit a phone viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await page.goto(route);
    await page.getByRole('button', { name: /上篇/ }).click();
    await page.getByRole('button', { name: /中篇/ }).click();
    await expect(page.locator('.side-story').first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: `private-review/events/ilion-${theme}-mobile.png`,
    });
  });
}
