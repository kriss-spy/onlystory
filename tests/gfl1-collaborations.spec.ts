import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import type { Episode } from '../src/model';

const catalog: Episode[] = JSON.parse(
  readFileSync(
    process.env.ONLYSTORY_GFL1_TEST_CATALOG ||
      'src/generated/gfl1-catalog.json',
    'utf8',
  ),
);
const definitions = JSON.parse(
  readFileSync('scripts/gfl1-collaborations.json', 'utf8'),
).collections as Record<
  string,
  {
    title: string;
    campaigns: number[];
    date: string;
    extras?: Record<string, string>;
  }
>;
const collaborations = catalog.filter((e) => e.eventType === 'collaboration');

test('all nine EN collaborations include their complete original script inventory and named extras', () => {
  expect(new Set(collaborations.map((e) => e.collectionId)).size).toBe(9);
  expect(collaborations).toHaveLength(403);
  const registry = JSON.parse(
    readFileSync(
      process.env.ONLYSTORY_GFL1_TEST_COLLECTIONS ||
        '.cache/gfl1/collections.json',
      'utf8',
    ),
  );
  for (const [slug, definition] of Object.entries(definitions)) {
    const episodes = collaborations.filter(
      (e) => e.collectionId === `gfl1-${slug}`,
    );
    const collection = registry.collections.find(
      (c: { id: string }) => c.id === `gfl1-${slug}`,
    );
    expect(collection.replayId).toBeNull();
    expect(collection.audit.missing).toEqual([]);
    const expected = registry.selection.sourceAssets.filter(
      (s: string) =>
        definition.campaigns.some((c) => s.startsWith(`${c}-`)) ||
        Object.hasOwn(definition.extras || {}, s),
    );
    expect(episodes.map((e) => e.id).sort()).toEqual(
      expected.map((s: string) => `gfl1-${s}`).sort(),
    );
    for (const episode of episodes) {
      expect(episode.date).toBe(definition.date);
      expect(episode.availability, episode.id).toBe('available');
      const program = JSON.parse(
        readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
      );
      expect(program.complete, episode.id).toBe(true);
    }
  }
  expect(catalog.some((e) => e.collectionId === 'gfl1-hitoribocchi')).toBe(
    false,
  );
});

test('every collaboration opens from its collection and renders the first story', async ({
  page,
}) => {
  for (const [slug, definition] of Object.entries(definitions)) {
    const episode = collaborations.find(
      (e) => e.collectionId === `gfl1-${slug}` && !e.placement,
    )!;
    await page.goto(`/games/gfl1/events/gfl1-${slug}`);
    await expect(
      page.getByRole('heading', { name: definition.title, exact: true }),
    ).toBeVisible();
    await page.locator(`a[href^="/read/gfl1/${episode.id}?"]`).first().click();
    await expect(page.getByTestId('gfl1-stage')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Story information', exact: true }),
    ).toBeVisible();
  }
});

// The bar stops at the jukebox choice VA11_1:3, so the deep link replays that
// original answer instead of inventing story state.
const barChoices = encodeURIComponent(JSON.stringify({ 'VA11_1:3': '1' }));

test('Valhalla bar scenes select either native drink response and continue', async ({
  page,
}) => {
  await page.goto(
    `/read/gfl1/gfl1-VA11_1?line=VA11_1%3A34&choices=${barChoices}`,
  );
  await page
    .getByRole('button', { name: 'Serve preferred drink', exact: true })
    .click();
  await expect(page).toHaveURL(/line=VA11_1%3A35/);
  await expect(page.locator('.dialogue-window')).toContainText(
    'Wow! You actually made the drink!',
  );
  await page.goto(
    `/read/gfl1/gfl1-VA11_1?line=VA11_1%3A34&choices=${barChoices}`,
  );
  await page
    .getByRole('button', { name: 'Serve another suitable drink', exact: true })
    .click();
  await expect(page).toHaveURL(/line=VA11_1%3A38/);
  await expect(page.locator('.dialogue-window')).toContainText(
    "this isn't quite like what I imagined",
  );
});
