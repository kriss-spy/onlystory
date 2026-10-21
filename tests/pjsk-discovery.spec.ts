import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { emptyData } from '../src/model';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import catalog from '../src/downloads/pjsk-catalog.json' with { type: 'json' };
import type { PjskRecipe } from '../src/downloads/pjsk-recipe';

test('fresh PJSK acquisition installs and reads offline without discovery metadata', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const descriptor = catalog.find(
    (item) => item.episode.id === 'pjsk-cn-unit-30001',
  )!;
  const recipe: PjskRecipe = JSON.parse(
    gunzipSync(
      readFileSync('src/downloads/pjsk-recipes/' + descriptor.recipe),
    ).toString(),
  );
  const discovery = recipe.media.files.find((file) =>
    file.sourceUrl?.endsWith('/live2d/model_list.json'),
  )!;
  const sourceFiles = [
    recipe.scenario,
    ...recipe.media.files.filter((file) => file.sourceUrl),
    ...(recipe.extraFiles ?? []),
  ];
  const originals = new Map(sourceFiles.map((file) => [file.sourceUrl!, file]));
  const originalPath = (file: typeof recipe.scenario) =>
    file === recipe.scenario
      ? resolve(pjskLibraryRoot, '../http', file.sha256 + '.bin')
      : pjskLibraryRoot + file.url;
  test.skip(
    sourceFiles.some(
      (file) =>
        file !== discovery &&
        !existsSync(originalPath(file as typeof recipe.scenario)),
    ),
    'Requires the verified local PJSK originals.',
  );
  const discoveryRequests: string[] = [];
  const unavailable: string[] = [];
  await context.route('**/onlystory-local-library.json', (route) =>
    route.fulfill({ status: 404 }),
  );
  await context.route('**/private/pjsk/**', (route) => {
    unavailable.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  await context.route(
    (url) => originals.has(url.href),
    (route) => {
      const file = originals.get(route.request().url())!;
      if (file === discovery) {
        discoveryRequests.push(route.request().url());
        return route.fulfill({
          body: Buffer.alloc(file.bytes + 1),
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      return route.fulfill({
        body: readFileSync(originalPath(file as typeof recipe.scenario)),
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    },
  );
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, emptyData());
  await page.goto('/downloads/' + descriptor.episode.id);
  await page
    .getByRole('button', { name: 'Download and import', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.getByRole('alert').count())
          ? await page.getByRole('alert').innerText()
          : (await page
                .getByRole('link', { name: 'Read story', exact: true })
                .isVisible())
            ? 'ready'
            : 'working',
      { timeout: 90000 },
    )
    .not.toBe('working');
  expect(await page.getByRole('alert').allTextContents()).toEqual([]);
  await expect(
    page.getByRole('link', { name: 'Read story', exact: true }),
  ).toBeVisible();
  expect(discoveryRequests).toEqual([]);
  expect(unavailable).toEqual([]);
  const state = await page.evaluate(async () => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
    const cache = await caches.open('onlystory.media.v1');
    return {
      data,
      keys: (await cache.keys()).map(
        (request) => new URL(request.url).pathname,
      ),
    };
  });
  expect(state.data.installed[descriptor.episode.id]).toBe(true);
  expect(state.keys).not.toContain(discovery.url);
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Read story', exact: true }).click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  await expect(page.locator('.dialogue-window')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
