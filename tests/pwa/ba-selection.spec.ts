import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import catalog from '../../src/downloads/ba/catalog.json' with { type: 'json' };
import type { BaRecipe } from '../../src/downloads/ba-catalog';
import { waitForImports } from '../helpers/wait-for-imports';
import { staticHost } from '../helpers/static-host';

test('BA toolbar selects two stories, imports their original folder, and opens both offline', async ({
  page,
  context,
}, info) => {
  test.setTimeout(600000);
  const retained = '.cache/ba-all-downloads/input-paths.json';
  test.skip(
    !fs.existsSync(retained),
    'Requires retained verified BA originals.',
  );
  const recipes = [2401, 2402].map((group) => {
    const entry = catalog.find((item) => item.group === group)!;
    return JSON.parse(
      gunzipSync(
        fs.readFileSync(path.resolve('src/downloads/ba/recipes', entry.recipe)),
      ).toString(),
    ) as BaRecipe;
  });
  expect(recipes[0].episode.collectionId).toBe(recipes[1].episode.collectionId);
  const paths = JSON.parse(fs.readFileSync(retained, 'utf8')) as (
    string | null
  )[];
  const fallback = JSON.parse(
    fs.readFileSync('.cache/ba-browser-import/input-paths.json', 'utf8'),
  ) as string[];
  const inputs = new Map(
    recipes.flatMap((recipe) =>
      recipe.inputs.map((input) => [input.id, input] as const),
    ),
  );
  test.skip(
    [...inputs.values()].some(
      (input) => !fs.existsSync(paths[input.id] ?? fallback[input.id] ?? ''),
    ),
    'Original files are unavailable.',
  );
  const folder = info.outputPath('originals');
  fs.mkdirSync(folder, { recursive: true });
  const names = new Map<string, string>();
  for (const input of inputs.values()) {
    const normalized = input.filename.toLowerCase();
    const previous = names.get(normalized);
    if (previous) {
      expect(previous, `Conflicting original filename ${input.filename}`).toBe(
        input.sha256,
      );
      continue;
    }
    names.set(normalized, input.sha256);
    fs.linkSync(
      path.resolve(paths[input.id] ?? fallback[input.id]),
      path.join(folder, input.filename),
    );
  }
  const host = await staticHost();
  const privateRequests = host.privateRequests;
  const errors: string[] = [];
  const origin = host.origin;
  try {
    await context.route(/^https?:\/\//, (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    );
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      origin + '/games/ba/events/' + recipes[0].episode.collectionId,
    );
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(
      await page.evaluate(async () =>
        (await caches.open('onlystory.media.v1'))
          .keys()
          .then((keys) => keys.length),
      ),
    ).toBe(0);
    await page
      .getByRole('button', { name: 'Select stories to download', exact: true })
      .click();
    for (const recipe of recipes) {
      await page
        .getByRole('checkbox', {
          name: 'Select ' + recipe.episode.title,
          exact: true,
        })
        .check();
    }
    const picker = page.waitForEvent('filechooser');
    await page
      .getByRole('button', {
        name: 'Download selected stories (2)',
        exact: true,
      })
      .click();
    await (await picker).setFiles(folder);
    await expect(
      page.getByRole('progressbar', { name: 'Download progress' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Downloading 2 stories/ }),
    ).toBeVisible();
    await waitForImports(
      page,
      recipes.map((recipe) => recipe.episode.id),
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    const passages = new Map<
      string,
      { id: string; text: { en: string; ja: string } }
    >();
    for (const recipe of recipes) {
      const inventory = await page.evaluate(async (episode) => {
        const cache = await caches.open('onlystory.media.v1');
        const chapter = await (await cache.match(episode.content!.url))!.json();
        const scene = await (await cache.match(
          episode.content!.sceneUrl!,
        ))!.json();
        const missing: string[] = [];
        for (const file of scene.assets.files)
          if (!(await cache.match(file.url))) missing.push(file.url);
        const passage = chapter.nodes.find(
          (node: {
            kind: string;
            speakerLocales?: { en?: string };
            text?: { en?: string; ja?: string };
          }) =>
            node.kind === 'text' &&
            node.speakerLocales?.en &&
            node.speakerLocales.en !== '???' &&
            node.text?.en &&
            node.text.ja,
        );
        return {
          nodes: chapter.nodes.length,
          steps: scene.steps.length,
          files: scene.assets.files.length,
          missing,
          passage,
        };
      }, recipe.episode);
      expect(inventory.nodes).toBe(recipe.episode.content!.count);
      expect(inventory.steps).toBe(inventory.nodes);
      expect(inventory.files).toBe(recipe.outputs.length);
      expect(inventory.missing).toEqual([]);
      expect(inventory.passage).toBeTruthy();
      passages.set(recipe.episode.id, inventory.passage);
    }
    await page.screenshot({
      path: info.outputPath('ba-two-stories-installed.png'),
    });
    const beforeOffline = privateRequests.slice();
    await page.close();
    await context.setOffline(true);
    for (const recipe of recipes) {
      const passage = passages.get(recipe.episode.id)!;
      const reopened = await context.newPage();
      reopened.on('pageerror', (error) => errors.push(error.message));
      await reopened.goto(
        origin +
          '/read/ba/' +
          recipe.episode.id +
          '?line=' +
          encodeURIComponent(passage.id),
      );
      await expect(reopened.getByTestId('ba-scene')).toBeVisible();
      await expect(reopened.getByTestId('ba-scene')).toHaveAttribute(
        'aria-busy',
        'false',
        { timeout: 60000 },
      );
      await expect(reopened.getByRole('alert')).toHaveCount(0);
      if (recipe.episode.textLocales?.includes('en')) {
        const language = reopened.getByRole('combobox', {
          name: 'Reading language',
          exact: true,
        });
        await language.selectOption('en');
        await expect(reopened.getByTestId('ba-scene')).toHaveAttribute(
          'aria-busy',
          'false',
          { timeout: 60000 },
        );
        const currentUrl = reopened.url();
        await expect(reopened.locator('.dialogue-window p')).toBeVisible();
        await expect(reopened.locator('.dialogue-window p')).toHaveText(
          passage.text.en,
        );
        await expect(
          reopened.locator('.dialogue-window p > span').last(),
        ).toHaveCSS('opacity', '1');
        expect(passage.text.en).toMatch(/[A-Za-z]/);
        expect(passage.text.en).not.toBe(passage.text.ja);
        await language.selectOption('ja');
        await expect(reopened).toHaveURL(currentUrl);
        await expect(reopened.locator('.dialogue-window p')).toHaveText(
          passage.text.ja,
        );
        await language.selectOption('en');
        await reopened.reload();
        await expect(language).toHaveValue('en');
        await expect(reopened.getByTestId('ba-scene')).toHaveAttribute(
          'aria-busy',
          'false',
          { timeout: 60000 },
        );
        await expect(reopened.locator('.ba-loading')).toHaveCount(0);
        await expect(reopened.locator('.dialogue-window p')).toBeVisible();
        await expect(reopened.locator('.dialogue-window p')).toHaveText(
          passage.text.en,
        );
        await expect(
          reopened.locator('.dialogue-window p > span').last(),
        ).toHaveCSS('opacity', '1');
      }
      await reopened.screenshot({
        path: info.outputPath(recipe.episode.id + '-offline.png'),
      });
      await reopened.close();
    }
    expect(privateRequests).toEqual(beforeOffline);
    expect(errors).toEqual([]);
  } finally {
    await host.close();
  }
});
