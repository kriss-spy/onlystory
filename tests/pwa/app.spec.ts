import { test as base, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryMiddleware } from '../../scripts/library-server.mjs';
import {
  libraryRoot,
  pjskLibraryRoot,
} from '../../scripts/local-environment.mjs';

// Each test serves the actual production build on its own origin. No dev-server
// service workers or mutations of dist are needed to exercise updates/failures.
const test = base.extend<{
  host: {
    url: string;
    update: () => void;
    failAsset: (value: boolean) => void;
  };
}>({
  host: async ({}, use) => {
    const source = readFileSync(resolve('dist/sw.js'), 'utf8');
    let revision = 0;
    let fail = false;
    const middleware = libraryMiddleware(libraryRoot, resolve('dist'), [
      pjskLibraryRoot,
    ]);
    const server = createServer((req, res) => {
      if (req.url === '/sw.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(
          source.replace(
            /const VERSION = "([^"]+)";/,
            `const VERSION = "$1-test${revision}";`,
          ),
        );
      } else if (fail && req.url === '/icons/app-maskable-512.png') {
        res.writeHead(503).end('Unavailable');
      } else middleware(req, res);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address() as { port: number };
    try {
      await use({
        url: `http://127.0.0.1:${address.port}`,
        update: () => {
          revision++;
        },
        failAsset: (value) => {
          fail = value;
        },
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
});

async function ready(page: import('@playwright/test').Page, url: string) {
  await page.goto(url + '/library');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test('manifest and icons are installable, and settings expose offline readiness', async ({
  page,
  host,
}) => {
  await ready(page, host.url);
  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  // Playwright's isolated browser contexts cannot install OS apps. Report any
  // app/manifest problem, allowing only that browser-profile restriction.
  const errors = (await cdp.send('Page.getInstallabilityErrors'))
    .installabilityErrors;
  expect(errors.filter((error) => error.errorId !== 'in-incognito')).toEqual(
    [],
  );
  const data = JSON.parse(manifest.data!);
  expect(data).toMatchObject({
    display: 'standalone',
    start_url: '/library',
    scope: '/',
  });
  for (const icon of data.icons) {
    const size = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByText('Ready to open offline.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toBeVisible();
  const sw = await page.request.get(host.url + '/sw.js');
  expect(sw.headers()['cache-control']).toBe('no-cache');
  const response = await page.request.get(host.url + '/manifest.webmanifest');
  expect(response.headers()['content-type']).toContain(
    'application/manifest+json',
  );
});

test('a downloaded original story reopens offline in a new window and retains its passage', async ({
  page,
  context,
  host,
}) => {
  await ready(page, host.url);
  await page.goto(host.url + '/games/ba/events/ba-jp-prologue');
  await page
    .getByRole('button', { name: 'Download プロローグ · 11000', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[
              'ba-jp-11000'
            ],
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  const route = '/read/ba/ba-jp-11000?line=11000%3A35';
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
    data.preferences.textSpeed = 0;
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
  });
  await page.goto(host.url + route);
  await expect(page.locator('.dialogue-window p')).not.toBeEmpty();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('onlystory.v1')!).saves[
            'ba-jp-11000'
          ]?.frames.at(-1)?.node,
      ),
    )
    .toBe('11000:35');
  const text = await page.locator('.dialogue-window p').textContent();
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto(host.url + '/read/ba/ba-jp-11000');
  await expect(reopened.locator('.reader-gate')).toHaveCount(0);
  await expect(reopened.locator('.dialogue-window p')).toHaveText(text!);
  await expect(reopened.locator('.reader-error')).toHaveCount(0);
  await expect(reopened.locator('.ba-canvas .ba-actors')).toBeVisible();
  await expect(reopened.locator('.ba-loading')).toHaveCount(0);
  await expect(reopened.locator('.scene-notices')).toHaveCount(0);
  await reopened.reload();
  await expect(reopened.locator('.dialogue-window p')).toHaveText(text!);
  await reopened.goto(host.url + '/bookmarks');
  await expect(
    reopened.getByRole('heading', { name: 'Saved passages', exact: true }),
  ).toBeVisible();
  await reopened.goto(host.url + '/games/ba?q=prologue');
  await expect(reopened.getByRole('searchbox')).toHaveValue('prologue');
});

test('cached media support aliases and ranges without caching undownloaded files', async ({
  page,
  context,
  host,
}) => {
  await ready(page, host.url);
  await page.evaluate(async () => {
    const cache = await caches.open('onlystory.media.v1');
    await cache.put(
      '/private/shared/range-test.mp4',
      new Response('0123456789', { headers: { 'Content-Type': 'video/mp4' } }),
    );
    await cache.put(
      '/private/shared/index.json',
      new Response(
        JSON.stringify({
          aliases: { '/private/old.mp4': '/private/shared/range-test.mp4' },
        }),
      ),
    );
    await cache.put('/private/versioned.json?v=2', new Response('version two'));
  });
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const read = async (range: string) => {
      const response = await fetch('/private/old.mp4', {
        headers: { Range: range },
      });
      return {
        status: response.status,
        range: response.headers.get('content-range'),
        text: await response.text(),
      };
    };
    return {
      middle: await read('bytes=2-5'),
      suffix: await read('bytes=-3'),
      invalid: await read('bytes=99-'),
      versioned: await (await fetch('/private/versioned.json?v=2')).text(),
      missing: await fetch('/private/not-downloaded.json').then(
        () => false,
        () => true,
      ),
    };
  });
  expect(result).toEqual({
    middle: { status: 206, range: 'bytes 2-5/10', text: '2345' },
    suffix: { status: 206, range: 'bytes 7-9/10', text: '789' },
    invalid: { status: 416, range: 'bytes */10', text: '' },
    versioned: 'version two',
    missing: true,
  });
});

test('updates wait for restart and preserve progress, downloads and another open window', async ({
  page,
  context,
  host,
}) => {
  await ready(page, host.url);
  await page.evaluate(async () => {
    const cache = await caches.open('onlystory.media.v1');
    await cache.put('/private/keep.json', new Response('keep my download'));
    const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
    data.preferences.fontSize = 27;
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
    (window as Window & { updateMarker?: string }).updateMarker =
      'still reading';
  });
  const other = await context.newPage();
  await other.goto(host.url + '/library');
  await other.evaluate(() => {
    (window as Window & { updateMarker?: string }).updateMarker =
      'other window';
  });
  host.update();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Check for updates', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restart to update', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { updateMarker?: string }).updateMarker,
    ),
  ).toBe('still reading');
  await page
    .getByRole('button', { name: 'Restart to update', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your games', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => ({
      font: JSON.parse(localStorage.getItem('onlystory.v1')!).preferences
        .fontSize,
      media: await (await (
        await caches.open('onlystory.media.v1')
      ).match('/private/keep.json'))!.text(),
      marker:
        (window as Window & { updateMarker?: string }).updateMarker ?? null,
    })),
  ).toEqual({ font: 27, media: 'keep my download', marker: null });
  expect(
    await other.evaluate(
      () => (window as Window & { updateMarker?: string }).updateMarker,
    ),
  ).toBe('other window');
});

test('failed offline setup can be retried without replacing the working page', async ({
  page,
  host,
}) => {
  host.failAsset(true);
  await page.goto(host.url + '/library');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByText('Offline launch is not ready.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    false,
  );
  host.failAsset(false);
  await page
    .getByRole('button', { name: 'Retry offline setup', exact: true })
    .click();
  await expect(
    page.getByText('Ready to open offline.', { exact: false }),
  ).toBeVisible();
});

test('an incomplete update leaves the existing offline app available', async ({
  page,
  context,
  host,
}) => {
  await ready(page, host.url);
  const initial = await page.evaluate(async () =>
    (await caches.keys()).filter((key) => key.startsWith('onlystory.shell.')),
  );
  host.failAsset(true);
  host.update();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('button', { name: 'Check for updates', exact: true })
    .click();
  await expect(
    page.getByText('The update could not be saved.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restart to update', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((key) => key.startsWith('onlystory.shell.')),
    ),
  ).toEqual(initial);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your games', exact: true }),
  ).toBeVisible();
});
