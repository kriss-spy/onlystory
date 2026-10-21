import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import catalog from '../../src/downloads/ba/catalog.json' with { type: 'json' };
import type { BaRecipe } from '../../src/downloads/ba-catalog';
import { waitForImports } from '../helpers/wait-for-imports';

test('BA database chapter imports from originals on a static host and cold launches offline', async ({
  page,
  context,
}, info) => {
  const retained = '.cache/ba-all-downloads/input-paths.json';
  test.skip(
    !fs.existsSync(retained),
    'Requires retained verified original BA files.',
  );
  test.setTimeout(600000);
  const entry = catalog.find((item) => item.group === 2401)!;
  const recipe = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.resolve('src/downloads/ba/recipes', entry.recipe)),
    ).toString(),
  ) as BaRecipe;
  const paths = JSON.parse(fs.readFileSync(retained, 'utf8')) as string[];
  const prologuePaths = fs.existsSync(
    '.cache/ba-browser-import/input-paths.json',
  )
    ? (JSON.parse(
        fs.readFileSync('.cache/ba-browser-import/input-paths.json', 'utf8'),
      ) as string[])
    : [];
  const originals = recipe.inputs.map(
    (input) => paths[input.id] ?? prologuePaths[input.id],
  );
  test.skip(
    !originals.every((file) => file && fs.existsSync(file)),
    'Original files are unavailable.',
  );
  const root = path.resolve('dist');
  const privateRequests: string[] = [];
  const errors: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    if (url.pathname.startsWith('/private/')) {
      privateRequests.push(url.pathname);
      response.writeHead(404).end();
      return;
    }
    let file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!path.extname(url.pathname)) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const mime: Record<string, string> = {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webmanifest': 'application/manifest+json',
    };
    response.setHeader(
      'Content-Type',
      mime[path.extname(file)] ?? 'application/octet-stream',
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
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
    await page.goto(origin + '/downloads/' + recipe.episode.id);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await expect(
      page.getByLabel('Choose original files', { exact: true }),
    ).toBeAttached();
    await page.evaluate(async () => {
      const cache = await caches.open('onlystory.ba-recipes.v1');
      const [key] = await cache.keys();
      if (!key) throw Error('Expected a cached chapter recipe');
      await cache.put(key, new Response('corrupted recipe'));
    });
    await page.reload();
    await page
      .getByLabel('Choose original files', { exact: true })
      .setInputFiles(originals);
    await page
      .getByRole('button', { name: 'Import story', exact: true })
      .click();
    await waitForImports(page, [recipe.episode.id]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const inventory = await page.evaluate(async (episode) => {
      const cache = await caches.open('onlystory.media.v1');
      const text = await (await cache.match(episode.content!.url))!.json();
      const scene = await (await cache.match(
        episode.content!.sceneUrl!,
      ))!.json();
      const missing: string[] = [];
      for (const file of scene.assets.files)
        if (!(await cache.match(file.url))) missing.push(file.url);
      return {
        nodes: text.nodes.length,
        steps: scene.steps.length,
        files: scene.assets.files.length,
        missing,
      };
    }, recipe.episode);
    expect(inventory.nodes).toBe(recipe.episode.content!.count);
    expect(inventory.steps).toBe(inventory.nodes);
    expect(inventory.files).toBe(recipe.outputs.length);
    expect(inventory.missing).toEqual([]);
    const requestsBeforeOffline = privateRequests.slice();
    await page.close();
    await context.setOffline(true);
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => errors.push(error.message));
    await reopened.goto(origin + `/read/ba/${recipe.episode.id}`);
    await expect(reopened.getByTestId('ba-scene')).toBeVisible();
    await expect(reopened.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 60000 },
    );
    await expect(reopened.getByRole('alert')).toHaveCount(0);
    await reopened.screenshot({
      path: info.outputPath('ba-database-offline.png'),
    });
    expect(privateRequests).toEqual(requestsBeforeOffline);
    expect(errors).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
