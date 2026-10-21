import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';
for (const locale of ['en', 'ja'] as const) {
  for (const row of [20, 32]) {
    test(`letter page ${row} captions do not overlap in ${locale}`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      const data = emptyData();
      data.preferences.textLocale = locale;
      data.preferences.textSpeed = 0;
      data.preferences.reducedMotion = true;
      data.preferences.chaptersOpen = true;
      data.preferences.theme = 'dark';
      await page.addInitScript(
        (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
        data,
      );
      await page.setViewportSize({ width: 2048, height: 1536 });
      await page.goto(
        `/read/ba/ba-jp-11010?line=11010%3A${row}&choices=` +
          encodeURIComponent(JSON.stringify({ '11010:7': 's0' })),
        { waitUntil: 'domcontentloaded' },
      );
      const captions = page.locator('.ba-captions > p');
      await expect(captions).toHaveCount(5, { timeout: 45000 });
      for (const viewport of [
        { width: 2048, height: 1536 },
        { width: 1365, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await expect
          .poll(async () =>
            captions.evaluateAll((elements) => {
              const boxes = elements.map((el) => el.getBoundingClientRect());
              const host = elements[0].parentElement!.getBoundingClientRect();
              const dialogue = document
                .querySelector('.dialogue-window')!
                .getBoundingClientRect();
              return boxes.every(
                (box, i) =>
                  box.width > 0 &&
                  box.left >= host.left - 1 &&
                  box.right <= host.right + 1 &&
                  box.top >= host.top - 1 &&
                  box.bottom <= dialogue.top + 1 &&
                  boxes.every(
                    (other, j) =>
                      i === j ||
                      box.bottom <= other.top + 1 ||
                      box.top >= other.bottom - 1,
                  ),
              );
            }),
          )
          .toBe(true);
        await page.screenshot({
          path: info.outputPath(`letter-${viewport.width}.png`),
        });
      }
    });
  }
}
