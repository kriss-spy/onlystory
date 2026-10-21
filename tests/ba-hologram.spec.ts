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

test('Arona communication has distinct scanlines without losing pale highlights', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/read/ba/ba-jp-11010?line=11010%3A40&choices=' +
      encodeURIComponent(JSON.stringify({ '11010:7': 's0' })),
  );
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  const projection = page.locator('.ba-signal:not(.ba-white-silhouettes)');
  const contrast = await projection.evaluate((canvas: HTMLCanvasElement) => {
    const { width, height } = canvas;
    const pixels = canvas
      .getContext('2d')!
      .getImageData(0, 0, width, height).data;
    const unit = height / 1080;
    let contrast = 0,
      count = 0;
    for (let band = 1; band < 180; band++) {
      const line = Math.floor((band * 6 + 0.5) * unit),
        clear = Math.floor((band * 6 + 3.5) * unit);
      for (let x = 0; x < width; x += 3) {
        const a = (line * width + x) * 4,
          b = (clear * width + x) * 4;
        if (
          pixels[a + 3] > 180 &&
          pixels[b + 3] > 180 &&
          pixels[b] > 170 &&
          pixels[b + 1] > 170 &&
          pixels[b + 2] > 170
        ) {
          contrast +=
            (pixels[b] +
              pixels[b + 1] +
              pixels[b + 2] -
              pixels[a] -
              pixels[a + 1] -
              pixels[a + 2]) /
            3;
          count++;
        }
      }
    }
    return { samples: count, difference: contrast / count };
  });
  await page.screenshot({ path: info.outputPath('arona-hologram.png') });
  expect(contrast.samples).toBeGreaterThan(100);
  expect(contrast.difference).toBeGreaterThan(18);
});
