import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const groupCollections = new Set(
  (
    JSON.parse(readFileSync('scripts/ba-library.json', 'utf8')) as {
      category: string;
      collectionId: string;
    }[]
  )
    .filter((definition) => definition.category === 'Group story')
    .map((definition) => definition.collectionId),
).size;

test.setTimeout(60000);

test('BA Club group stories are selectable and open the original scene reader', async ({
  page,
}) => {
  await page.goto('/games/ba?category=Group+story');
  await expect(page.locator('.event-row')).toHaveCount(groupCollections);
  await expect(page.locator('.event-row .event-cover')).toHaveCount(
    groupCollections,
  );
  const group = page.locator('.event-row').filter({ hasText: '美食研究会' });
  await expect(group).toHaveCount(1);
  await expect(group.locator('.school-badge')).toContainText('Gehenna');
  await expect
    .poll(() =>
      group
        .locator('.event-cover')
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await group.getByRole('link').click();
  await expect(page.locator('.event-heading')).toContainText('美食研究会');
  await expect(page.locator('.event-heading-cover')).toBeVisible();
  await expect(page.getByAltText('Gehenna school mark')).toBeVisible();
  await expect(page.getByText('4 stories', { exact: true })).toBeVisible();
  await page.goto('/read/ba/ba-jp-1101?line=1101%3A3');
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 45000 },
  );
  await expect(page.locator('.dialogue-window p')).not.toBeEmpty();
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /.+/,
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});
