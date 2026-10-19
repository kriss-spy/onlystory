import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const index = () =>
  JSON.parse(readFileSync('public/private/shared/index.json', 'utf8'));

test('old texture links resolve to exact compressed assets with correct MIME and range support', async ({
  request,
}) => {
  const [old, target] = Object.entries(index().aliases).find(
    ([old]) => old.endsWith('.png') && old.includes('/characters/'),
  ) as [string, string];
  const response = await request.get(old);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toBe('image/webp');
  expect(await response.body()).toEqual(readFileSync(`public${target}`));
  const range = await request.get(target, { headers: { Range: 'bytes=0-11' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).subarray(0, 4).toString()).toBe('RIFF');
});

test('existing audio downloads migrate by digest and remain readable offline through old URLs', async ({
  page,
  context,
}) => {
  const [old, target] = Object.entries(index().aliases).find(([old]) =>
    old.endsWith('.ogg'),
  ) as [string, string];
  await page.goto('/library');
  await page.evaluate(
    async ({ old, target }) => {
      const cache = await caches.open('onlystory.media.v1');
      await cache.put(old, await fetch(target));
      const module = '/src/media-storage.ts';
      const { migrateMediaCache } = await import(module);
      await migrateMediaCache();
    },
    { old, target },
  );
  await context.setOffline(true);
  const result = await page.evaluate(
    async ({ old, target }) => {
      const cache = await caches.open('onlystory.media.v1');
      const module = '/src/media-storage.ts';
      const { matchMedia } = await import(module);
      return {
        old: !!(await cache.match(old)),
        shared: !!(await cache.match(target)),
        bytes: (await (await matchMedia(cache, old))?.blob())?.size,
      };
    },
    { old, target },
  );
  expect(result.old).toBe(false);
  expect(result.shared).toBe(true);
  expect(result.bytes).toBeGreaterThan(0);
});

test('movie downloads install only the selected voice, add the other without refetching shared assets, and seek offline', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const scenes = JSON.parse(
    readFileSync('src/generated/gfl2-ilion-scenes.json', 'utf8'),
  );
  const program = JSON.parse(
    readFileSync(
      `public${new URL(scenes.sections['gfl2-ilion-34401'].url, 'http://localhost').pathname}`,
      'utf8',
    ),
  );
  const movies = Object.values(program.videos) as {
    voices: Record<string, { url: string }>;
  }[];
  const chinese = movies.map((movie) => movie.voices['zh-CN'].url);
  const japanese = movies.map((movie) => movie.voices.ja.url);
  const requests: string[] = [];
  page.on('request', (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  await page.goto('/manage?game=gfl2');
  const voice = page.getByLabel('Download voice language');
  await voice.selectOption('ja');
  const row = page
    .locator('.download-item')
    .filter({ has: page.locator('a[href="/read/gfl2/gfl2-ilion-34401"]') });
  await page
    .getByRole('searchbox', { name: 'Search downloads' })
    .fill(await row.locator('a').innerText());
  await row.getByRole('button', { name: /^Download / }).click();
  await expect(row).toContainText('On this device', { timeout: 70000 });
  const keys = () =>
    page.evaluate(async () =>
      (await (await caches.open('onlystory.media.v1')).keys()).map(
        (key) => new URL(key.url).pathname,
      ),
    );
  const first = await keys();
  for (const url of japanese) expect(first).toContain(url);
  for (const url of chinese) expect(first).not.toContain(url);
  const shared = program.files.find((file: { url: string }) =>
    file.url.endsWith('.webp'),
  ).url;
  expect(requests.filter((url) => url === shared)).toHaveLength(1);
  await voice.selectOption('zh-CN');
  await row.getByRole('button', { name: /^Download / }).click();
  await expect(row).toContainText('On this device', { timeout: 40000 });
  for (const url of [...chinese, ...japanese])
    expect(await keys()).toContain(url);
  expect(requests.filter((url) => url === shared)).toHaveLength(1);
  await context.setOffline(true);
  await row.locator('a').click();
  const video = page.getByLabel('Story movie', { exact: true });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 12;
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) =>
        Math.abs(element.currentTime - 12),
      ),
    )
    .toBeLessThan(0.1);
});
