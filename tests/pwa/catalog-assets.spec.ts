import { test, expect } from '@playwright/test';
import { staticHost } from '../helpers/static-host';
import { readFileSync } from 'node:fs';
const assets = JSON.parse(
  readFileSync('src/catalog-assets.json', 'utf8'),
) as Record<string, { url: string }>;
const covers = JSON.parse(readFileSync('src/cover-art.json', 'utf8'));

test('desktop library renders bundled game covers online and after an offline reload', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'onlystoryDesktop', { value: {} });
  });
  const host = await staticHost();
  const checkCovers = async () => {
    const images = page.locator('.game-cover img');
    await expect(images).toHaveCount(Object.keys(covers.games).length);
    expect(
      await images.evaluateAll((images) =>
        Promise.all(
          images.map(async (image) => {
            const cover = image as HTMLImageElement;
            await cover.decode();
            return (
              cover.naturalWidth > 0 &&
              cover.getAttribute('src')!.startsWith('/catalog-art/')
            );
          }),
        ),
      ),
    ).toEqual(Object.keys(covers.games).map(() => true));
  };
  try {
    await page.goto(host.origin + '/library');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await checkCovers();
    await context.setOffline(true);
    await page.reload();
    await checkCovers();
  } finally {
    await host.close();
  }
});

test('release catalog artwork and app language survive a cold offline launch', async ({
  page,
  context,
}) => {
  const host = await staticHost();
  try {
    await page.goto(host.origin + '/library');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const urls = [...new Set(Object.values(assets).map((item) => item.url))];
    // No story imports or media-cache seeding. Every image must already be in
    // the installed shell even if its collection has never been visited.
    expect(
      await page.evaluate(async (urls) => {
        const missing = [];
        for (const url of urls)
          if (!(await caches.match(url))) missing.push(url);
        return missing;
      }, urls),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Language', exact: true }).click();
    await page
      .getByLabel('App language', { exact: true })
      .selectOption('zh-CN');
    await expect(page.getByLabel('应用语言', { exact: true })).toHaveValue(
      'zh-CN',
    );
    await page.getByLabel('应用语言', { exact: true }).selectOption('ja');
    await expect(page.getByLabel('アプリの言語', { exact: true })).toHaveValue(
      'ja',
    );
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem('onlystory.v1')!).preferences,
    );
    expect(before.textLocale).toBe('en');
    expect(before.catalogLocale).toBe('original');
    await page.close();
    await context.setOffline(true);
    const offline = await context.newPage();
    await offline.goto(host.origin + '/library');
    await expect(offline.locator('html')).toHaveAttribute('lang', 'ja');
    const failures = await offline.evaluate(async (urls) => {
      const failed = [];
      for (const url of urls) {
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
        } catch {
          failed.push(url);
        }
      }
      return failed;
    }, urls);
    expect(failures).toEqual([]);
    expect(
      host.privateRequests.filter((url) => /\.(?:png|jpg|webp)$/.test(url)),
    ).toEqual([]);
  } finally {
    await host.close();
  }
});
