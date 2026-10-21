import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { preferJapaneseBa } from './helpers/ba-language';

test.beforeEach(async ({ page }) => preferJapaneseBa(page));

const library = JSON.parse(readFileSync('scripts/ba-library.json', 'utf8')) as {
  category: string;
  collectionId: string;
  story: string;
}[];
const eventCollectionCount = new Set(
  library
    .filter((definition) => definition.category === 'Event')
    .map((definition) => definition.collectionId),
).size;
const coverArt = JSON.parse(readFileSync('src/cover-art.json', 'utf8')) as {
  events: Record<string, { logo?: unknown }>;
};
const coveredEvents = Object.keys(coverArt.events).filter(
  (key) => key.startsWith('ba:ba-jp-event-') && coverArt.events[key].logo,
).length;
const catalogCollections = (
  JSON.parse(readFileSync('src/ba-catalog.json', 'utf8')) as {
    collections: Record<string, { schools: string[] }>;
  }
).collections;
const eventLabels = Object.entries(catalogCollections).filter(([key]) =>
  key.startsWith('ba-jp-event-'),
);
const labelledCount = (school: string) =>
  eventLabels.filter(([, entry]) => entry.schools.includes(school)).length;
const badgeCount = eventLabels.reduce(
  (total, [, entry]) => total + entry.schools.length,
  0,
);
const labelledSearch = (school: string, text: string) => {
  const labelled = new Set(
    eventLabels
      .filter(([, entry]) => entry.schools.includes(school))
      .map(([key]) => key),
  );
  return new Set(
    library
      .filter(
        (definition) =>
          definition.category === 'Event' &&
          labelled.has(definition.collectionId) &&
          definition.story.includes(text),
      )
      .map((definition) => definition.collectionId),
  ).size;
};

test('BA school and story filters combine and survive event navigation', async ({
  page,
}) => {
  await page.goto('/games/ba');
  const school = page.getByRole('combobox', { name: 'School', exact: true });
  const category = page.getByRole('combobox', { name: 'Story category' });
  await school.selectOption('gehenna');
  const schoolCollections = Object.values(
    JSON.parse(readFileSync('src/ba-catalog.json', 'utf8')).collections,
  ) as { schools: string[] }[];
  await expect(page.locator('.event-row')).toHaveCount(
    schoolCollections.filter((entry) => entry.schools.includes('gehenna'))
      .length,
  );
  await category.selectOption('Event');
  await expect(page.locator('.event-row')).toHaveCount(
    labelledCount('gehenna'),
  );
  await expect(page).toHaveURL(/school=gehenna/);
  await page.reload();
  await expect(school).toHaveValue('gehenna');
  await expect(category).toHaveValue('Event');
  await page.getByRole('searchbox', { name: 'Search events' }).fill('ヒナ');
  await expect(page.locator('.event-row')).toHaveCount(
    labelledSearch('gehenna', 'ヒナ'),
  );
  await page.getByRole('link', { name: /ヒナ委員長/ }).click();
  await expect(page.locator('.event-heading')).toContainText('Gehenna');
  await expect(page.getByAltText('Gehenna school mark')).toBeVisible();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(school).toHaveValue('gehenna');
  await expect(category).toHaveValue('Event');
  await expect(
    page.getByRole('searchbox', { name: 'Search events' }),
  ).toHaveValue('ヒナ');
  await page.getByRole('searchbox', { name: 'Search events' }).fill('');
  await school.selectOption('trinity');
  await expect(page.locator('.event-row')).toHaveCount(
    labelledCount('trinity'),
  );
  await expect(page.locator('.event-row', { hasText: '夏空' })).toHaveCount(
    labelledSearch('trinity', '夏空'),
  );
  await school.selectOption('abydos');
  await expect(page.locator('.event-row')).toHaveCount(labelledCount('abydos'));
  await school.selectOption('all');
  await expect(page.locator('.event-row')).toHaveCount(eventCollectionCount);
});

test('the BA events show decoded original covers, title logos and school emblems', async ({
  page,
}, info) => {
  for (const size of [
    { width: 1129, height: 826 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/games/ba?category=Event');
    await expect(page.locator('.event-artwork')).toHaveCount(coveredEvents);
    await expect(page.locator('.event-artwork-logo')).toHaveCount(
      coveredEvents,
    );
    await expect
      .poll(() =>
        page
          .locator('.event-row img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await expect(page.locator('.event-row .school-badge img')).toHaveCount(
      badgeCount,
    );
    expect(
      await page.locator('.event-row').evaluateAll((rows) =>
        rows.every((row) => {
          const bounds = row.getBoundingClientRect();
          return [
            ...row.querySelectorAll('.event-info > *, .school-badge'),
          ].every((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
          });
        }),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`catalog-${size.width}.png`),
    });
    await page.getByRole('link', { name: /ヒナ委員長/ }).click();
    await expect(
      page.locator('.event-heading-cover .event-artwork-logo'),
    ).toBeVisible();
    await expect(page.getByAltText('Gehenna school mark')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`event-${size.width}.png`) });
  }
});
