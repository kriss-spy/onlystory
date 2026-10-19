import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';
import { readPjskEpisode } from './pjsk-installed';

test('a deferred-voice chapter downloads before first reading and plays offline', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180000);
  const episode = readPjskEpisode('src/generated/pjsk-cn-event-1000001.json');
  const route = `/read/pjsk/${episode.id}`;
  const voices = episode.assets.filter((url) =>
    url.startsWith('/private/pjsk/remote/'),
  );
  expect(voices.length).toBeGreaterThan(20);
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        voice: 'ja',
        voiceVolume: 0.5,
      },
    },
  );
  await page.goto('/manage?game=pjsk');
  await page
    .getByRole('searchbox', { name: 'Search downloads' })
    .fill(episode.title);
  const row = page
    .locator('.download-item')
    .filter({ has: page.locator(`a[href="${route}"]`) });
  await row.getByRole('button', { name: /^Download / }).click();
  await expect(row).toContainText('On this device', { timeout: 120000 });
  const keys = await page.evaluate(async () =>
    (await (await caches.open('onlystory.media.v1')).keys()).map(
      (request) => new URL(request.url).pathname,
    ),
  );
  for (const url of episode.assets) expect(keys).toContain(url);
  await context.setOffline(true);
  await row.getByRole('link').click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  const index = episode.nodes.findIndex((node, i) => i > 0 && node.voice);
  expect(index).toBeGreaterThan(0);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill(String(index));
  await expect(page.locator('.dialogue-window')).toContainText(
    episode.nodes[index].text['zh-CN']!,
  );
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate((audio) => ({
          ready: audio.readyState >= 2,
          error: audio.error?.code ?? null,
          blob: audio.currentSrc.startsWith('blob:'),
        })),
    )
    .toEqual({ ready: true, error: null, blob: true });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('deferred-offline.png') });
});
