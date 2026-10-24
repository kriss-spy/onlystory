import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('upcoming camera marker is visible and locked until its earlier choices are answered', async ({
  page,
}, info) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    emptyData(),
  );
  await page.goto('/read/ba/ba-jp-41040?line=41040%3A0');
  const marker = page.locator('[data-scene-node="41040:51"]');
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('aria-disabled', 'true');
  await expect(marker).toHaveCSS('opacity', '0.45');
  await marker.focus();
  await expect(page.getByRole('tooltip')).toContainText(
    'Answer earlier choices to replay',
  );
  const initial = page.url();
  await marker.press('Enter');
  await expect(page).toHaveURL(initial);
  await page.screenshot({ path: info.outputPath('locked-scenes.png') });
  await page.goto(
    '/read/ba/ba-jp-41040?line=41040%3A21&choices=' +
      encodeURIComponent(
        JSON.stringify({ '41040:3': 's1', '41040:7': 's0', '41040:13': 's0' }),
      ),
  );
  await expect(marker).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.story-choices > button').first().click();
  await expect(marker).toHaveAttribute('aria-disabled', 'false');
  await marker.click();
  await expect(page).toHaveURL(/line=41040%3A51/);
});

test('all prologue scenes appear at entry and unlock only up to the next unanswered choice', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 487, height: 900 });
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    emptyData(),
  );
  await page.goto('/read/ba/ba-jp-10000005?line=10000005%3A0');
  const markers = page.locator('.scene-marker');
  await expect(markers).toHaveCount(6);
  await expect(page.locator('.scene-marker[aria-disabled="true"]')).toHaveCount(
    6,
  );
  const boxes = await markers.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      expect(
        a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height,
      ).toBe(false);
    }
  await page.screenshot({ path: info.outputPath('all-scenes-narrow.png') });
  const answers = {
    '10000005:4': 's0',
    '10000005:8': 's0',
    '10000005:14': 's1',
    '10000005:24': 's0',
    '10000005:34': 's4',
  };
  await page.goto(
    '/read/ba/ba-jp-10000005?line=10000005%3A51&choices=' +
      encodeURIComponent(JSON.stringify(answers)),
  );
  await expect(page.locator('[data-scene-node="10000005:56"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.locator('.story-choices > button').first().click();
  await expect(page.locator('[data-scene-node="10000005:56"]')).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  await expect(page.locator('[data-scene-node="10000005:74"]')).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  await expect(page.locator('.scene-marker[aria-disabled="true"]')).toHaveCount(
    4,
  );
});

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
