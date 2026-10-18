import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
const artwork = JSON.parse(readFileSync('src/cover-art.json', 'utf8'));

test('every GFL1 collection has a complete original-game artwork record and verified local image', () => {
  const catalog = JSON.parse(
    readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
  );
  const collections = new Set<string>(
    catalog.map((episode: { collectionId: string }) => episode.collectionId),
  );
  expect(collections.size).toBe(60);
  for (const id of collections) {
    const cover = (
      artwork.events as Record<
        string,
        {
          url: string;
          kind: string;
          fit: string;
          sha256: string;
          nativeSource: {
            file: string;
            sha256: string;
            texture: string;
            pathId: string;
            pixelSha256: string;
          };
        }
      >
    )[`gfl1:${id}`];
    expect(cover, id).toBeTruthy();
    expect(cover.kind).toBe('official-game-art');
    expect(cover.fit).toBe('contain');
    expect(cover.url).toMatch(/^\/private\/gfl1\/covers\//);
    const bytes = readFileSync(resolve(libraryRoot, '.' + cover.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(cover.sha256);
    expect(cover.nativeSource.file).toMatch(
      /(?:resourcetitle|resourceiconops)\.ab$/,
    );
    expect(cover.nativeSource.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cover.nativeSource.pixelSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cover.nativeSource.pathId).toMatch(/^-?\d+$/);
    expect(cover.nativeSource.pathId).not.toBe('0');
  }
});

test('all GFL1 covers load at their full proportions on desktop and mobile with publisher credits', async ({
  page,
}) => {
  await page.goto('/games/gfl1');
  const covers = page.locator('.event-cover');
  await expect(covers).toHaveCount(60);
  await expect(page.locator('.event-number')).toHaveCount(0);
  await expect
    .poll(() =>
      covers.evaluateAll((elements) =>
        elements.every((element) => {
          const image = element as HTMLImageElement;
          return (
            image.complete &&
            image.naturalWidth === Number(image.getAttribute('width')) &&
            image.naturalHeight === Number(image.getAttribute('height'))
          );
        }),
      ),
    )
    .toBe(true);
  const ratios = await covers.evaluateAll((elements) =>
    elements.map((element) => {
      const image = element as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return {
        fit: getComputedStyle(image).objectFit,
        actual: rect.width / rect.height,
        expected: image.naturalWidth / image.naturalHeight,
      };
    }),
  );
  for (const ratio of ratios) {
    expect(ratio.fit).toBe('contain');
    expect(ratio.actual).toBeCloseTo(ratio.expected, 2);
  }
  await page.screenshot({ path: test.info().outputPath('desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('mobile-events.png') });
  await page
    .getByRole('combobox', { name: 'Story type' })
    .selectOption('Main story');
  await expect(covers).toHaveCount(14);
  await page.screenshot({ path: test.info().outputPath('mobile-main.png') });
  await page.goto('/games/gfl1/events/gfl1-quantum-fluctuations');
  const hero = page.locator('.event-heading-cover');
  await expect(hero).toBeVisible();
  await expect
    .poll(() =>
      hero.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(480);
  await expect(
    page.getByRole('link', { name: 'Official artwork · Sunborn / MICA Team' }),
  ).toHaveAttribute('href', 'https://store.steampowered.com/app/3887700/');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath('mobile-collection.png'),
  });
});
