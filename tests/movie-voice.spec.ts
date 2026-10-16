import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const movies = JSON.parse(
  readFileSync('public/private/gfl2-ilion/videos/manifest.json', 'utf8'),
).videos;

test('original movie voice switches preserve time, playback and saved language', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-ilion-34401?line=MA22001%3A1');
  const movie = page.getByLabel('Story movie', { exact: true });
  const ready = () =>
    expect
      .poll(() => movie.evaluate((video: HTMLVideoElement) => video.readyState))
      .toBeGreaterThanOrEqual(2);
  await ready();
  const chinese = await movie.getAttribute('src');
  expect(chinese).toBe(movies['12201'].voices['zh-CN'].url);
  await movie.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 12;
    video.volume = 0;
  });
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(12, 0);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await expect(page.getByLabel('Text language', { exact: true })).toHaveCount(
    0,
  );
  const voice = page.getByLabel('Voice language', { exact: true });
  await expect(voice.locator('option')).toHaveText(['中文', '日本語']);
  await voice.selectOption('ja');
  await expect(movie).not.toHaveAttribute('src', chinese!);
  await ready();
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(12, 0);
  expect(await movie.evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
  await page.getByRole('slider', { name: /Voice volume/ }).fill('0.35');
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.volume))
    .toBeCloseTo(0.35);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await ready();
  await expect(movie).toHaveAttribute('src', movies['12201'].voices.ja.url);
  await movie.evaluate(async (video: HTMLVideoElement) => {
    video.currentTime = 15;
    video.playbackRate = 0.5;
    await video.play();
  });
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await voice.selectOption('zh-CN');
  await expect(movie).toHaveAttribute('src', chinese!);
  await ready();
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => !video.paused))
    .toBe(true);
  const state = await movie.evaluate((video: HTMLVideoElement) => ({
    time: video.currentTime,
    rate: video.playbackRate,
    volume: video.volume,
  }));
  expect(state.time).toBeGreaterThanOrEqual(15);
  expect(state.time).toBeLessThan(20);
  expect(state.rate).toBe(0.5);
  expect(state.volume).toBeCloseTo(0.35);
});
