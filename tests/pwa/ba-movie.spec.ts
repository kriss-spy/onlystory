import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import catalog from '../../src/downloads/ba/catalog.json' with { type: 'json' };
import type { BaRecipe } from '../../src/downloads/ba-catalog';
import { staticHost } from '../helpers/static-host';
import { waitForImports } from '../helpers/wait-for-imports';

test('a complete original BA movie converts in the browser and seeks after a cold offline launch', async ({
  page,
  context,
}, info) => {
  test.setTimeout(1800000);
  const retained = '.cache/ba-all-downloads/input-paths.json';
  test.skip(
    !fs.existsSync(retained),
    'Requires retained verified BA originals.',
  );
  const entry = catalog.find((item) => item.group === 212161)!;
  const recipe = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.resolve('src/downloads/ba/recipes', entry.recipe)),
    ).toString(),
  ) as BaRecipe;
  const paths = JSON.parse(fs.readFileSync(retained, 'utf8')) as string[];
  const fallback = JSON.parse(
    fs.readFileSync('.cache/ba-browser-import/input-paths.json', 'utf8'),
  ) as string[];
  const originals = recipe.inputs.map(
    (input) => paths[input.id] ?? fallback[input.id],
  );
  test.skip(
    !originals.every((file) => file && fs.existsSync(file)),
    'Original movie files are unavailable.',
  );
  const host = await staticHost();
  const errors: string[] = [];
  const started = Date.now();
  try {
    await context.route(/^https?:\/\//, (route) =>
      route
        .request()
        .url()
        .startsWith(host.origin + '/')
        ? route.continue()
        : route.abort(),
    );
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(host.origin + '/downloads/' + recipe.episode.id);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await page.evaluate(() => !!window.onlystoryDesktop)).toBe(false);
    await page
      .getByLabel('Choose original files', { exact: true })
      .setInputFiles(originals);
    await page
      .getByRole('button', { name: 'Import story', exact: true })
      .click();
    await waitForImports(page, [recipe.episode.id], 1500000);
    const conversionMs = Date.now() - started;
    const movie = await page.evaluate(async (episode) => {
      const cache = await caches.open('onlystory.media.v1');
      const chapter = await (await cache.match(episode.content!.url))!.json();
      const node = chapter.nodes.find(
        (item: { kind: string }) => item.kind === 'video',
      );
      const response = await cache.match(node.video);
      return {
        id: node.id,
        url: node.video,
        bytes: (await response!.blob()).size,
      };
    }, recipe.episode);
    expect(movie.bytes).toBeGreaterThan(1000000);
    const beforeOffline = host.privateRequests.slice();
    await page.close();
    await context.setOffline(true);
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => errors.push(error.message));
    await reopened.goto(
      host.origin +
        '/read/ba/' +
        recipe.episode.id +
        '?line=' +
        encodeURIComponent(movie.id),
    );
    const video = reopened.locator('video');
    await expect(video).toBeVisible();
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    const metadata = await video.evaluate((element: HTMLVideoElement) => ({
      duration: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
    }));
    expect(metadata.duration).toBeGreaterThan(58);
    expect(metadata.duration).toBeLessThan(61);
    expect(metadata.width).toBeGreaterThanOrEqual(1280);
    await video.click();
    await video.evaluate(async (element: HTMLVideoElement) => {
      element.currentTime = element.duration - 4;
      await element.play();
    });
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.currentTime),
      )
      .toBeGreaterThan(metadata.duration - 3.5);
    const decoded = await video.evaluate((element: HTMLVideoElement) => ({
      frames: element.getVideoPlaybackQuality().totalVideoFrames,
      audioBytes: (
        element as HTMLVideoElement & { webkitAudioDecodedByteCount: number }
      ).webkitAudioDecodedByteCount,
    }));
    expect(decoded.frames).toBeGreaterThan(0);
    expect(decoded.audioBytes).toBeGreaterThan(0);
    await reopened.screenshot({
      path: info.outputPath('ba-full-movie-offline.png'),
    });
    fs.writeFileSync(
      info.outputPath('ba-browser-movie-verification.json'),
      JSON.stringify(
        {
          episode: recipe.episode.id,
          originalInputs: recipe.inputs.filter((input) =>
            /212000_MV_(?:Video|Sound)/.test(input.filename),
          ),
          movie,
          metadata,
          decoded,
          conversionMs,
          coldOffline: true,
          errors,
        },
        null,
        2,
      ),
    );
    expect(host.privateRequests).toEqual(beforeOffline);
    expect(errors).toEqual([]);
  } finally {
    await host.close();
  }
});
