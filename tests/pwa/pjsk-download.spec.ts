import { test as base, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import catalog from '../../src/downloads/pjsk-catalog.json' with { type: 'json' };
const entry = catalog.find((c) => c.episode.id === 'pjsk-cn-unit-30001')!;
const recipe = {
  ...JSON.parse(
    gunzipSync(
      readFileSync(resolve('src/downloads/pjsk-recipes', entry.recipe)),
    ).toString(),
  ),
  episode: entry.episode,
};

// Deliberately serve dist only. No library middleware, private files or proxy.
const test = base.extend<{ host: { url: string; privateRequests: string[] } }>({
  host: async ({}, use) => {
    const privateRequests: string[] = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      if (url.pathname.startsWith('/private/')) {
        privateRequests.push(url.pathname);
        res.writeHead(404).end('No asset server');
        return;
      }
      const file = resolve('dist', '.' + url.pathname);
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      if (url.pathname !== '/' && existsSync(file)) {
        res.setHeader(
          'Content-Type',
          mime[extname(file)] ?? 'application/octet-stream',
        );
        res.end(readFileSync(file));
      } else if (/^\/(?:$|library|read\/|games\/|manage)/.test(url.pathname)) {
        res.setHeader('Content-Type', 'text/html');
        res.end(readFileSync('dist/index.html'));
      } else res.writeHead(404).end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      await use({
        url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        privateRequests,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
});
const route = `/read/pjsk/${recipe.entry.id}`;
const diagnostics = (page: Page) =>
  page.getByTestId('pjsk-layers').evaluate(
    (el) =>
      (
        el as HTMLElement & {
          playbackDiagnostics: {
            index: number;
            ready: boolean;
            models: { visible: boolean }[];
            audioState: string;
            lastCommand: number;
          };
        }
      ).playbackDiagnostics,
  );
async function ready(page: Page, index: number) {
  await expect
    .poll(async () => (await diagnostics(page))?.index, { timeout: 30000 })
    .toBe(index);
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('static-only host downloads PJSK directly, then reads every passage offline', async ({
  page,
  context,
  host,
}, info) => {
  test.skip(
    process.env.PJSK_LIVE_DOWNLOAD !== '1',
    'Opt in with PJSK_LIVE_DOWNLOAD=1 to exercise the public mirror.',
  );
  test.setTimeout(480000);
  const errors: string[] = [];
  const sources = new Set<string>();
  let scenarioRequests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (req) => {
    if (req.url() === recipe.scenario.sourceUrl) scenarioRequests++;
    if (
      req.url().startsWith('https://storage.sekai.best/') ||
      req.url().startsWith('https://raw.githubusercontent.com/Sekai-World/')
    )
      sources.add(req.url());
  });
  await page.goto(host.url + route);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(
    await page.evaluate(
      async () =>
        (await (await caches.open('onlystory.media.v1')).keys()).length,
    ),
  ).toBe(0);
  await page
    .getByRole('button', { name: 'Download story', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(async (url) => {
          const cached = await (
            await caches.open('onlystory.media.v1')
          ).match(url);
          return cached ? (await cached.arrayBuffer()).byteLength : 0;
        }, recipe.scenario.url),
      { timeout: 60000 },
    )
    .toBe(recipe.scenario.bytes);
  await page
    .getByRole('button', { name: 'Cancel download', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Download canceled');
  await page.reload();
  await page
    .getByRole('button', { name: 'Download story', exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const installed = await page.evaluate(
          (id) =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[id],
          recipe.entry.id,
        );
        return (
          installed ||
          (await page
            .getByRole('alert')
            .textContent({ timeout: 100 })
            .catch(() => false))
        );
      },
      { timeout: 240000 },
    )
    .not.toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) => !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[id],
      recipe.entry.id,
    ),
  ).toBe(true);
  expect(scenarioRequests).toBe(1);
  await ready(page, 0);
  expect(sources.has(recipe.scenario.sourceUrl)).toBe(true);
  for (const file of recipe.media.files.filter((file) => file.sourceUrl))
    expect(sources.has(file.sourceUrl!)).toBe(true);
  const paths = await page.evaluate(async (id) => {
    const files = JSON.parse(localStorage.getItem('onlystory.v1')!)
      .installations[id].files as string[];
    // The cached manifest contains the complete media inventory.
    const response = await (
      await caches.open('onlystory.media.v1')
    ).match(files[0]);
    return (await response!.json()).files as string[];
  }, recipe.entry.id);
  expect(paths).toContain(recipe.text.url);
  expect(paths).toContain(recipe.scenario.url);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1')!);
    data.preferences.textSpeed = 0;
    data.preferences.waitVoice = false;
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
  });
  const onlineRequests = host.privateRequests.slice();
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  reopened.on('pageerror', (error) => errors.push(error.message));
  await reopened.goto(host.url + route);
  await ready(reopened, 0);
  const models = (await diagnostics(reopened)).models;
  expect(models.length).toBe(Object.keys(recipe.media.models).length);
  const audio = reopened.getByRole('button', {
    name: 'Enable scene audio',
    exact: true,
  });
  if (await audio.count()) await audio.click();
  await expect
    .poll(async () => (await diagnostics(reopened)).audioState)
    .toBe('running');
  const decodedVoices = await reopened.evaluate(
    async (urls) => {
      const cache = await caches.open('onlystory.media.v1');
      const context = new AudioContext();
      try {
        for (const url of urls) {
          const response = await cache.match(url);
          if (!response) throw new Error(`Missing offline voice: ${url}`);
          const decoded = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (decoded.duration <= 0) throw new Error('Empty offline voice');
        }
        return urls.length;
      } finally {
        await context.close();
      }
    },
    [...new Set(Object.values(recipe.media.voices))],
  );
  expect(decodedVoices).toBe(Object.keys(recipe.media.voices).length);
  for (let index = 1; index < recipe.episode.content.count; index++) {
    await reopened
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await ready(reopened, index);
  }
  await expect(reopened.locator('.episode-end')).toContainText('本话结束');
  expect((await diagnostics(reopened)).lastCommand).toBe(175);
  await reopened.screenshot({
    path: info.outputPath('pjsk-offline-complete.png'),
  });
  await reopened.close();
  const resumed = await context.newPage();
  await resumed.goto(host.url + route);
  await ready(resumed, recipe.episode.content.count - 1);
  expect(host.privateRequests).toEqual(onlineRequests);
  expect(
    onlineRequests.filter(
      (path) =>
        path !== '/private/shared/index.json' &&
        path !== recipe.episode.content.url,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('catalog downloads select in place and show progress on the same button', async ({
  page,
  context,
  host,
}, info) => {
  const requested: string[] = [];
  await context.route('https://storage.sekai.best/**', (route) => {
    requested.push(route.request().url());
    // Leave acquisition pending until the user cancels.
  });
  await page.goto(host.url + '/games/pjsk?category=Main+story');
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  await expect(page).toHaveURL(/\/games\/pjsk/);
  await page.locator('.download-selection-checkbox:enabled').first().check();
  await expect(
    page.getByRole('button', { name: /Download selected stories/ }),
  ).not.toHaveAccessibleName('Download selected stories (0)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.locator('.event-row > a').first().click();
  const url = page.url();
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  const stories = page.locator(
    '.story-card .download-selection-checkbox:enabled',
  );
  await stories.nth(0).check();
  await stories.nth(1).check();
  await expect(
    page.getByRole('button', {
      name: 'Download selected stories (2)',
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('.story-card-link').nth(1).click();
  await expect(
    page.getByRole('button', {
      name: 'Download selected stories (1)',
      exact: true,
    }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  await page
    .getByRole('button', { name: 'Download selected stories (1)', exact: true })
    .click();
  const ring = page.getByRole('progressbar', { name: 'Download progress' });
  await expect(ring).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Downloading 1 stories/ }),
  ).toBeVisible();
  await expect(ring).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('catalog-download-ring.png') });
  await page
    .getByRole('button', { name: 'Cancel downloads', exact: true })
    .click();
  await expect(ring).toHaveCount(0);
  expect(requested.filter((url) => url.endsWith('.asset'))).toHaveLength(1);
  expect(page.url()).toBe(url);
});

test('unverified downloaders stay pending and all BA collections are selectable', async ({
  page,
  host,
}) => {
  for (const game of ['gfl1', 'gfl2']) {
    await page.goto(host.url + `/games/${game}`);
    await page.getByLabel('Collection layout').selectOption('list');
    await expect(page.locator('.download-unsupported')).toHaveCount(0);
    await page.locator('.event-row > a').first().click();
    await page
      .getByRole('button', { name: 'Select stories to download', exact: true })
      .click();
    const card = page.locator('.story-card').first();
    await expect(card.locator('.download-unsupported')).toHaveText(
      'Downloader pending',
    );
    await expect(card.getByRole('checkbox')).toBeDisabled();
    const url = page.url();
    await expect(card.locator('a')).toHaveAttribute('aria-disabled', 'true');
    await card.locator('a').click({ force: true });
    expect(page.url()).toBe(url);
    await expect(
      page.getByRole('button', {
        name: 'Download selected stories (0)',
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.download-unsupported')).toHaveCount(0);
    await page.goto(host.url + `/games/${game}`);
    for (const layout of ['list', 'grid', 'table']) {
      await page.getByLabel('Collection layout').selectOption(layout);
      await page
        .getByRole('button', {
          name: 'Select stories to download',
          exact: true,
        })
        .click();
      await expect(
        page.locator('.event-row').first().locator('.download-unsupported'),
      ).toHaveText('Downloader pending');
      await expect(
        page.locator('.download-selection-checkbox:enabled'),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  }
  await page.goto(host.url + '/games/ba?category=Main+story');
  await page.getByLabel('Collection layout').selectOption('list');
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  // Every BA collection has a known acquisition/import path.
  await expect(
    page.locator('.download-selection-checkbox').first(),
  ).toBeEnabled();
  await expect(
    page.locator('.download-selection-checkbox:disabled'),
  ).toHaveCount(0);
  await expect(page.locator('.download-unsupported')).toHaveCount(0);
});

test('catalog selection works in grid and table layouts in both themes', async ({
  page,
  host,
}) => {
  await page.goto(host.url + '/games/pjsk?category=Main+story');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }, theme);
    for (const layout of ['grid', 'table']) {
      await page.getByLabel('Collection layout').selectOption(layout);
      await page
        .getByRole('button', {
          name: 'Select stories to download',
          exact: true,
        })
        .click();
      const checkbox = page
        .locator('.download-selection-checkbox:enabled')
        .first();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect(
        page.getByRole('button', { name: /Download selected stories/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      await page
        .getByRole('button', { name: 'Cancel download selection', exact: true })
        .click();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
    }
  }
});

test('failed source downloads are retryable and never marked installed', async ({
  page,
  context,
  host,
}) => {
  await context.route('https://storage.sekai.best/**', (route) =>
    route.fulfill({
      status: 503,
      body: 'Unavailable',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.goto(host.url + route);
  await page
    .getByRole('button', { name: 'Download story', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('PJSK download failed');
  await expect(
    page.getByRole('button', { name: 'Retry download', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (id) => !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[id],
      recipe.entry.id,
    ),
  ).toBe(false);
  await page
    .getByRole('button', { name: 'Retry download', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('PJSK download failed');
});

test('all PJSK chapters are searchable without rendering or precaching the entire download catalog', async ({
  page,
  host,
}) => {
  await page.goto(host.url + '/manage?game=pjsk&source=online');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('.acquisition-link')).toHaveCount(2);
  await expect(page.locator('.download-item')).toHaveCount(60);
  await expect(
    page.getByRole('navigation', { name: 'Download pages' }),
  ).toContainText(String(catalog.length));
  await page
    .getByRole('navigation', { name: 'Download pages' })
    .getByRole('button', { name: 'Next', exact: true })
    .click();
  await expect(page.locator('.download-item')).toHaveCount(60);
  const last = catalog.at(-1)!;
  await page
    .getByRole('searchbox', { name: 'Search downloads' })
    .fill(last.episode.title);
  await expect(
    page.locator(`.download-item a[href$="/${last.episode.id}"]`),
  ).toBeVisible();
  const cachedRecipes = await page.evaluate(async () => {
    const shells = (await caches.keys()).filter((name) =>
      name.startsWith('onlystory.shell.'),
    );
    const keys = await Promise.all(
      shells.map(async (name) =>
        (await (await caches.open(name)).keys()).map((key) => key.url),
      ),
    );
    return keys.flat().filter((url) => /\/pjsk-.*\.gz$/.test(url));
  });
  expect(cachedRecipes).toEqual([]);
});
