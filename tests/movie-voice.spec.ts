import { test, expect } from '@playwright/test';

test('original movie voice switches preserve time, playback and saved language', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/read/gfl2/gfl2-ilion-34401?line=MA22001%3A1', {
    waitUntil: 'domcontentloaded',
  });
  const movie = page.getByLabel('Story movie', { exact: true });
  const ready = () =>
    expect
      .poll(
        () => movie.evaluate((video: HTMLVideoElement) => video.readyState),
        { timeout: 20000 },
      )
      .toBeGreaterThanOrEqual(2);
  const bufferedAt = (time: number) =>
    expect
      .poll(
        () =>
          movie.evaluate((video: HTMLVideoElement, target) => {
            for (let i = 0; i < video.buffered.length; i++)
              if (
                video.buffered.start(i) <= target &&
                video.buffered.end(i) > target
              )
                return true;
            return false;
          }, time),
        { timeout: 20000 },
      )
      .toBe(true);
  await ready();
  const chinese = await movie.getAttribute('src');
  expect(chinese).toMatch(/^blob:/);
  await expect(movie).toHaveAttribute('data-movie-mode', 'shared-streams');
  await expect(movie).toHaveAttribute('data-movie-voice', 'zh-CN');
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
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  const voice = page.getByLabel('Voice language', { exact: true });
  await expect(voice.locator('option')).toHaveText(['中文', '日本語']);
  await voice.selectOption('ja');
  await expect(movie).not.toHaveAttribute('src', chinese!);
  await ready();
  await bufferedAt(12);
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
  await expect(movie).toHaveAttribute('data-movie-voice', 'ja');
  await movie.evaluate(async (video: HTMLVideoElement) => {
    video.currentTime = 15;
    video.playbackRate = 0.5;
    await video.play();
  });
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await voice.selectOption('zh-CN');
  await expect(movie).toHaveAttribute('data-movie-voice', 'zh-CN');
  await ready();
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => !video.paused))
    .toBe(true);
  await expect
    .poll(() =>
      movie.evaluate(
        (video: HTMLVideoElement) =>
          (video as HTMLVideoElement & { webkitAudioDecodedByteCount: number })
            .webkitAudioDecodedByteCount,
      ),
    )
    .toBeGreaterThan(0);
  const state = await movie.evaluate((video: HTMLVideoElement) => ({
    time: video.currentTime,
    rate: video.playbackRate,
    volume: video.volume,
  }));
  expect(state.time).toBeGreaterThanOrEqual(15);
  expect(state.time).toBeLessThan(20);
  expect(state.rate).toBe(0.5);
  expect(state.volume).toBeCloseTo(0.35);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await movie.evaluate((video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 75;
  });
  await ready();
  await bufferedAt(75);
  await expect
    .poll(() =>
      movie.evaluate((video: HTMLVideoElement) => {
        let duration = 0;
        for (let i = 0; i < video.buffered.length; i++)
          duration += video.buffered.end(i) - video.buffered.start(i);
        return duration;
      }),
    )
    .toBeLessThanOrEqual(50);
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(75, 0);
  await movie.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 2;
  });
  await ready();
  await bufferedAt(2);
  await movie.evaluate((video: HTMLVideoElement) => {
    video.currentTime = video.duration - 0.2;
    video.playbackRate = 2;
    return video.play();
  });
  await expect
    .poll(() => movie.evaluate((video: HTMLVideoElement) => video.ended), {
      timeout: 15000,
    })
    .toBe(true);
});
