import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import recipe from '../../src/downloads/ba/recipe.json' with { type: 'json' };
import { waitForImports } from '../helpers/wait-for-imports';

test('BA original-file UI rejects corruption, imports in background and reopens offline', async ({
  page,
  context,
}, info) => {
  const fixture = '.cache/ba-browser-import/input-paths.json';
  test.skip(
    !fs.existsSync(fixture),
    'Requires retained originals from the BA feasibility probe.',
  );
  test.setTimeout(600000);
  const retained: string[] = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const shared = '.cache/ba-all-downloads/input-paths.json';
  const sharedPaths: string[] = fs.existsSync(shared)
    ? JSON.parse(fs.readFileSync(shared, 'utf8'))
    : [];
  const originals = recipe.inputs.map(
    (input) => retained[input.id] ?? sharedPaths[input.id],
  );
  test.skip(
    !originals.every((file) => file && fs.existsSync(file)),
    'Retained original files are unavailable.',
  );
  const privateRequests: string[] = [],
    externalRequests: string[] = [],
    errors: string[] = [];
  const root = path.resolve('dist');
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
    const types: Record<string, string> = {
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
      types[path.extname(file)] ?? 'application/octet-stream',
    );
    response.end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^https?:/.test(url) && !url.startsWith(origin + '/')) {
        externalRequests.push(url);
        return route.abort();
      }
      return route.continue();
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/downloads/' + recipe.episode.id);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await expect(
      page.getByRole('button', { name: 'Import story', exact: true }),
    ).toBeDisabled();
    const wrong = Buffer.from(fs.readFileSync(originals[0]));
    wrong[wrong.length - 1] ^= 1;
    const picker = page.getByLabel('Choose original files', { exact: true });
    await picker.setInputFiles({
      name: recipe.inputs[0].filename,
      mimeType: 'application/octet-stream',
      buffer: wrong,
    });
    await picker.setInputFiles(originals.slice(1));
    await page
      .getByRole('button', { name: 'Import story', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('checksum mismatch');
    expect(
      await page.evaluate(
        async () =>
          (await (await caches.open('onlystory.media.v1')).keys()).length,
      ),
    ).toBe(0);
    await picker.setInputFiles(originals[0]);
    await page.screenshot({ path: info.outputPath('import-dark.png') });
    await page
      .getByRole('button', { name: 'Import story', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Episode downloads', exact: true })
      .click();
    await waitForImports(page, [recipe.episode.id]);
    await context.setOffline(true);
    await page.goto(origin + '/downloads/' + recipe.episode.id);
    await page.getByRole('link', { name: 'Read story', exact: true }).click();
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await expect(page.locator('.scene-notices')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Fast-forward', exact: true })
      .click();
    await expect(page.locator('.story-choices button').first()).toBeVisible({
      timeout: 45000,
    });
    await page.screenshot({ path: info.outputPath('offline-choice.png') });
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(
      privateRequests.filter((url) => url !== '/private/shared/index.json'),
    ).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
