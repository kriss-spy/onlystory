import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import type { Episode } from '../src/model';

const catalog: Episode[] = JSON.parse(
  readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
);
const main = catalog.filter((episode) => episode.category === 'Main story');

test('all installed numbered main-story scripts are published once with complete original dialogue', () => {
  const originals = readdirSync('.cache/gfl1/scripts')
    .filter((file) => /^\d+-.*\.txt$/.test(file))
    .map((file) => `gfl1-${file.slice(0, -4)}`)
    .sort();
  expect(main.map((episode) => episode.id).sort()).toEqual(originals);
  expect(main).toHaveLength(373);
  expect(new Set(main.map((episode) => episode.collectionId)).size).toBe(14);
  for (const episode of main) {
    const program = JSON.parse(
      readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
    );
    expect(program.complete, episode.id).toBe(true);
    expect(program.nodes.at(-1).kind, episode.id).toBe('end');
    const raw = readFileSync(
      `.cache/gfl1/scripts/${episode.id.slice(5)}.txt`,
      'utf8',
    );
    expect(
      readFileSync(resolve(libraryRoot, '.' + episode.sourceUrl!), 'utf8'),
      episode.id,
    ).toBe(raw);
    expect(
      [
        ...new Set(
          program.nodes.flatMap((node: { source?: { row: number } }) =>
            node.source ? [node.source.row] : [],
          ),
        ),
      ].sort((a, b) => Number(a) - Number(b)),
      episode.id,
    ).toEqual(program.sourceRows.map((row: { row: number }) => row.row));
  }
});

test('main-story catalog includes every chapter, grouped modes, stable old links and late-game reading', async ({
  page,
}) => {
  await page.goto('/games/gfl1?category=Main+story&sort=story');
  const titles = page.locator('.event-row h2');
  await expect(titles).toHaveCount(14);
  await expect(titles.first()).toHaveText('Chapter 0 · Seed');
  await expect(titles.last()).toHaveText('Chapter 13 · The Oblivione');
  await page
    .locator('.event-row a')
    .filter({ hasText: 'Chapter 1 · Awakening' })
    .click();
  await expect(page).toHaveURL(/events\/gfl1-chapter-1-normal/);
  await expect(page.getByRole('button', { name: /^Normal\b/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Emergency\b/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Night\b/ })).toBeVisible();
  for (const [script, row] of [
    ['0-4-1', 5],
    ['7-4-2', 35],
    ['8-1-2E', 8],
    ['13-1-1First', 2],
  ] as const) {
    await page.goto(
      `/read/gfl1/gfl1-${script}?line=${encodeURIComponent(`${script}:${row}`)}`,
    );
    await expect(page.getByTestId('gfl1-stage')).toBeVisible();
    await expect(page.locator('.dialogue-window')).not.toBeEmpty();
    await expect(
      page.getByText('This source row needs an unsupported story command.'),
    ).toHaveCount(0);
    const position = page.getByRole('slider', {
      name: 'Story position',
      exact: true,
    });
    await position.fill((await position.getAttribute('max')) ?? '0');
    await expect(
      page.getByRole('link', { name: 'Back to stories', exact: true }).last(),
    ).toBeVisible();
  }
});
