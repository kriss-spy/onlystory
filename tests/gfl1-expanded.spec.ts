import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import type { Episode, StoryNode } from '../src/model';

const catalogPath =
  process.env.ONLYSTORY_GFL1_TEST_CATALOG || 'src/generated/gfl1-catalog.json';
const catalog: Episode[] = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, 'utf8'))
  : [];
const collections = new Set(
  catalog
    .filter((episode) => episode.category === 'Event')
    .map((episode) => episode.collectionId),
);
test.beforeEach(() =>
  test.skip(
    collections.size <= 4,
    'Import the expanded native event catalog first.',
  ),
);

test('expanded event packages preserve original sources and declare every blocked scene', async () => {
  expect(collections.size).toBe(46);
  expect(catalog.length).toBeGreaterThan(1400);
  const ids = new Set<string>();
  let passages = 0;
  for (const episode of catalog) {
    expect(ids.has(episode.id), episode.id).toBe(false);
    ids.add(episode.id);
    const program = JSON.parse(
      readFileSync(resolve(libraryRoot, '.' + episode.content!.url), 'utf8'),
    );
    assert.deepEqual(
      program.audit.filter(
        (entry: { kind: string }) =>
          /missing-(portrait|background)/.test(entry.kind) &&
          !(
            (program.id === 'gfl1-13-5-2End' &&
              entry.kind === 'missing-background' &&
              (entry as { bin?: string }).bin === '252') ||
            (program.id === 'gfl1-13-3-1E' &&
              entry.kind === 'missing-background' &&
              (entry as { bin?: string }).bin === '253') ||
            (['gfl1--64-3-0', 'gfl1--64-4-0'].includes(program.id) &&
              entry.kind === 'missing-background' &&
              (entry as { bin?: string }).bin === '562')
          ),
      ),
      [],
      `${episode.id}: unresolved original image`,
    );
    expect(program.nodes.length, episode.id).toBe(episode.content!.count);
    const nodes = new Map<string, StoryNode>(
      program.nodes.map((node: StoryNode) => [node.id, node]),
    );
    const pending = [episode.entryNodeId!];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      assert(nodes.has(id), `${episode.id}: broken graph ${id}`);
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.get(id)!;
      pending.push(
        ...(node.choices?.map((choice) => choice.next) ??
          (node.next ? [node.next] : [])),
      );
    }
    expect(visited.size, episode.id).toBe(program.nodes.length);
    for (const url of episode.assets)
      assert(existsSync(resolve(libraryRoot, '.' + url)), url);
    if (program.complete) {
      expect(episode.availability).toBe('available');
      expect(program.nodes.at(-1).kind).toBe('end');
      assert.deepEqual(
        [
          ...new Set(
            program.nodes.flatMap((node: StoryNode) =>
              node.source ? [node.source.row] : [],
            ),
          ),
        ].sort((a, b) => a - b),
        program.sourceRows.map((row: { row: number }) => row.row),
        `${episode.id}: every source passage remains reachable`,
      );
      passages += program.sourceRows.length;
    } else {
      expect(episode.availability).toBe('incomplete');
      expect(
        program.nodes.some((node: StoryNode) => node.kind === 'unsupported'),
        episode.id,
      ).toBe(true);
      expect(
        program.audit.some((entry: { kind: string }) =>
          /unsupported|ambiguous|source-gap/.test(entry.kind),
        ),
        episode.id,
      ).toBe(true);
    }
    if (
      episode.sourceUrl &&
      !program.audit.some(
        (entry: { kind: string }) => entry.kind === 'source-gap',
      )
    ) {
      const raw = readFileSync(
        resolve(libraryRoot, '.' + episode.sourceUrl),
        'utf8',
      )
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((row) => row.trim());
      assert.deepEqual(
        program.sourceRows.map((source: { raw: string }) => source.raw),
        raw,
        episode.id,
      );
    }
  }
  expect(passages).toBeGreaterThan(50000);
});

test('the browser decodes every expanded package, including explicit source gaps', async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto('/games/gfl1');
  const result = await page.evaluate(async (episodes) => {
    const path = '/src/playback/gfl1/story.ts';
    const { decodeGfl1Story } = await import(path);
    let count = 0;
    const failures: string[] = [];
    for (let start = 0; start < episodes.length; start += 24) {
      await Promise.all(
        episodes.slice(start, start + 24).map(async (episode) => {
          try {
            const response = await fetch(episode.content!.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            decodeGfl1Story(await response.json(), episode);
            count++;
          } catch (error) {
            failures.push(`${episode.id}: ${String(error)}`);
          }
        }),
      );
    }
    return { count, failures };
  }, catalog);
  expect(result.failures).toEqual([]);
  expect(result.count).toBe(catalog.length);
});

test('new events open through their real catalog entries and retain source-linked progress', async ({
  page,
}) => {
  for (const collection of [
    'gfl1-arctic-warfare',
    'gfl1-singularity',
    'gfl1-isomer',
    'gfl1-shattered-connexion',
    'gfl1-polarized-light',
  ]) {
    const first = catalog.find(
      (episode) =>
        episode.collectionId === collection &&
        !episode.placement &&
        episode.availability === 'available',
    );
    expect(first, collection).toBeTruthy();
    await page.goto(`/games/gfl1/events/${collection}`);
    await page.locator(`a[href^="/read/gfl1/${first!.id}?"]`).first().click();
    await expect(page.getByTestId('gfl1-stage')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(first!.id));
    await expect(
      page.getByRole('button', { name: 'Story information', exact: true }),
    ).toBeVisible();
  }
});

test('seeking to a native portrait fade restores its endpoint with either motion preference', async ({
  page,
}) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/read/gfl1/gfl1--48-5-5?line=-48-5-5%3A14');
    await expect(page.getByTestId('gfl1-stage')).toBeVisible();
    const portrait = page.locator('.gfl1-portrait').first();
    await expect(portrait).toHaveCSS('opacity', '0');
    await expect(portrait).toHaveCSS('animation-name', 'none');
  }
});

test('the bartender portrait resolves its original external sprite when the alpha slot is empty', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--49-2-1?line=-49-2-1%3A83');
  const stage = page.getByTestId('gfl1-stage');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.gfl1-missing')).toHaveCount(0);
  const portrait = stage.locator('.gfl1-character').first();
  await expect(portrait).toBeVisible();
  await expect
    .poll(() =>
      portrait.evaluate(
        (element) => (element as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
});
