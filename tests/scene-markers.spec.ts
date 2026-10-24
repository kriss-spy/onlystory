import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('a completed movie marker restarts playback and gates Next again', async ({
  page,
}) => {
  await page.addInitScript((data) => {
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, emptyData());
  await page.goto(
    '/read/pjsk/pjsk-1?line=recording&choices=%7B%22decision%22%3A%22listen%22%7D',
  );
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThan(0);
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.currentTime = el.duration - 0.2;
    await el.play();
  });
  const next = page.getByRole('button', { name: 'Next passage', exact: true });
  await expect(next).toBeEnabled();
  await page.getByRole('button', { name: /^Replay Movie at passage/ }).click();
  await expect(next).toBeDisabled();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await video.evaluate((el: HTMLVideoElement) => el.currentTime),
  ).toBeLessThan(3);
});
