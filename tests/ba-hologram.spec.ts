import { expect, test } from '@playwright/test';

test('Rin communication keeps pale highlights instead of a saturated cyan tint', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/read/ba/ba-jp-41010?line=41010%3A12&choices=%7B%2241010%3A5%22%3A%22s0%22%7D',
  );
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  const projection = page.locator('.ba-signal:not(.ba-white-silhouettes)');
  const highlights = await projection.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 1] > 140 && pixels[i + 2] > 140 && pixels[i + 3] > 100) {
        red += pixels[i];
        green += pixels[i + 1];
        count++;
      }
    }
    return { count, balance: red / green };
  });
  await page.screenshot({ path: testInfo.outputPath('rin-hologram.png') });
  expect(highlights.count).toBeGreaterThan(10000);
  expect(highlights.balance).toBeGreaterThan(0.8);
});
