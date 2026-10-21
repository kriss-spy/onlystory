import { expect, test } from '@playwright/test';

test('two windows coordinate one shared transfer and retain its cache entry', async ({
  page,
  context,
}) => {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const other = await context.newPage();
  await other.goto('/library', { waitUntil: 'domcontentloaded' });
  let requests = 0;
  await context.route('**/private/storage-test-shared.bin', async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      body: Buffer.from([1, 2, 3]),
      headers: {
        'Content-Length': '3',
        'Content-Type': 'application/octet-stream',
      },
    });
  });
  const read = () => async () => {
    const module = '/src/media-storage.ts';
    const { downloadAsset } = await import(module);
    return downloadAsset(
      await caches.open('onlystory.media.v1'),
      '/private/storage-test-shared.bin',
      new AbortController().signal,
      () => {},
    );
  };
  expect(
    await Promise.all([page.evaluate(read()), other.evaluate(read())]),
  ).toEqual([3, 3]);
  expect(requests).toBe(1);
});

test('cleanup waits for another window, then checks the newly installed dependencies before deleting', async ({
  page,
  context,
}) => {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const other = await context.newPage();
  await other.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const module = '/src/media-reclamation.ts',
      model = '/src/model.ts',
      locks = '/src/media-lock.ts';
    const { retainRemovedMedia } = await import(module),
      { emptyData } = await import(model),
      { acquireLibraryLock } = await import(locks);
    const state = emptyData();
    state.installed.old = true;
    state.installations = {
      old: { files: ['/private/storage-shared'], voices: ['ja'] },
    };
    localStorage.setItem('onlystory.v1', JSON.stringify(state));
    const cache = await caches.open('onlystory.media.v1');
    await cache.put('/private/storage-shared', new Response('shared'));
    await retainRemovedMedia(cache, state, ['old'], 0);
    const release = await acquireLibraryLock(new AbortController().signal);
    (window as any).releaseStorageTest = () => {
      state.installed.new = true;
      state.installed.old = false;
      state.installations.new = {
        files: ['/private/storage-shared'],
        voices: ['ja'],
      };
      localStorage.setItem('onlystory.v1', JSON.stringify(state));
      release();
    };
  });
  const pending = other.evaluate(async () => {
    const module = '/src/media-reclamation.ts';
    const { reclaimRemovedMedia } = await import(module);
    return reclaimRemovedMedia(
      () => JSON.parse(localStorage.getItem('onlystory.v1')!),
      { dryRun: false },
    );
  });
  await expect
    .poll(() =>
      other.evaluate(async () =>
        (await navigator.locks.query()).pending?.some(
          (lock) => lock.name === 'onlystory:media-library',
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => (window as any).releaseStorageTest());
  expect((await pending).files).toEqual([]);
  expect(
    await other.evaluate(
      async () =>
        !!(await (
          await caches.open('onlystory.media.v1')
        ).match('/private/storage-shared')),
    ),
  ).toBe(true);
});

test('removing a download supports Undo, then frees its unique media after retention while shared media survive', async ({
  page,
}) => {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const state = {
      version: 1,
      installed: { 'gfl2-1': true, 'gfl2-2': true },
      installations: {
        'gfl2-1': {
          files: ['/private/storage-unique', '/private/storage-shared'],
          voices: ['zh-CN', 'ja'],
        },
        'gfl2-2': {
          files: ['/private/storage-shared'],
          voices: ['zh-CN', 'ja'],
        },
      },
    };
    const cache = await caches.open('onlystory.media.v1');
    for (const path of ['/private/storage-unique', '/private/storage-shared'])
      await cache.put(
        path,
        new Response('cached', { headers: { 'Content-Length': '6' } }),
      );
    localStorage.setItem('onlystory.v1', JSON.stringify(state));
  });
  await page.clock.install();
  await page.goto('/manage?game=gfl2&examples=1', {
    waitUntil: 'domcontentloaded',
  });
  const row = page
    .locator('.download-item')
    .filter({ has: page.locator('a[href="/read/gfl2/gfl2-1"]') });
  await expect(row).toContainText('On this device');
  await row.getByRole('button', { name: /^Remove download/ }).click();
  await expect(row).not.toContainText('On this device');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row).toContainText('On this device');
  await row.getByRole('button', { name: /^Remove download/ }).click();
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeVisible();
  await page.clock.runFor(46_000);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await (
            await caches.open('onlystory.media.v1')
          ).match('/private/storage-unique')),
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      async () =>
        !!(await (
          await caches.open('onlystory.media.v1')
        ).match('/private/storage-shared')),
    ),
  ).toBe(true);
});

test('toolbar selection measures unique source bytes before downloading and fits a narrow screen', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const sources: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://storage.sekai.best/'))
      sources.push(request.url());
  });
  await page.goto('/games/pjsk/events/pjsk-cn-idol-main', {
    waitUntil: 'domcontentloaded',
  });
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  await page
    .locator('[data-story-id="pjsk-cn-unit-30001"]')
    .getByRole('checkbox')
    .check();
  await expect(page.locator('.download-selection-size')).toContainText(
    /\d.*new/,
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole('button', {
      name: 'Download selected stories (1)',
      exact: true,
    }),
  ).toBeVisible();
  expect(sources).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.locator('.download-selection-size')).toBeVisible();
  expect(
    await page
      .locator('.app-header')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
