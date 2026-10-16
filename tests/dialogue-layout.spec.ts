import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData } from '../src/model';

for (const layout of ['scene', 'desk'] as const)
  for (const width of [1365, 320]) {
    test(`${layout} dialogue height stays fixed during fast-forward at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
      const data = emptyData();
      data.preferences = {
        ...data.preferences,
        layout,
        textSpeed: 0,
        reducedMotion: true,
        musicVolume: 0,
        soundVolume: 0,
      };
      await page.addInitScript(
        (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
        data,
      );
      await page.goto('/read/gfl2/gfl2-ilion-34401?line=M22003%3A3');
      const box = page.locator('.dialogue-window');
      await expect(box).toBeVisible();
      await page
        .getByRole('button', { name: 'Fast-forward', exact: true })
        .click();
      const samples = await box.evaluate(
        (element) =>
          new Promise<{ height: number; top: number; text: string }[]>(
            (resolve) => {
              const start = performance.now();
              const result: { height: number; top: number; text: string }[] =
                [];
              const sample = () => {
                const bounds = element.getBoundingClientRect();
                result.push({
                  height: bounds.height,
                  top: bounds.top,
                  text: element.textContent ?? '',
                });
                if (performance.now() - start < 1800)
                  requestAnimationFrame(sample);
                else resolve(result);
              };
              requestAnimationFrame(sample);
            },
          ),
      );
      await page
        .getByRole('button', { name: 'Stop fast-forward', exact: true })
        .click();
      expect(
        new Set(samples.map((sample) => sample.text)).size,
      ).toBeGreaterThan(3);
      expect(
        Math.max(...samples.map((sample) => sample.height)) -
          Math.min(...samples.map((sample) => sample.height)),
      ).toBeLessThan(1);
      expect(
        Math.max(...samples.map((sample) => sample.top)) -
          Math.min(...samples.map((sample) => sample.top)),
      ).toBeLessThan(1);
    });
  }

test('long dialogue scrolls inside the stable box and the next passage starts at the top', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const contents = JSON.parse(
    readFileSync('public/private/gfl2-ilion/readers/34401.json', 'utf8'),
  );
  const longest = contents.passages
    .filter((p: { kind?: string }) => !p.kind)
    .sort(
      (a: { text: string }, b: { text: string }) =>
        b.text.length - a.text.length,
    )[0];
  const data = emptyData();
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    data,
  );
  await page.goto(
    `/read/gfl2/gfl2-ilion-34401?line=${encodeURIComponent(longest.id)}`,
  );
  const box = page.locator('.dialogue-window');
  await expect(box).toBeVisible();
  const before = await box.boundingBox();
  await box.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await box.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect.poll(() => box.evaluate((element) => element.scrollTop)).toBe(0);
  expect((await box.boundingBox())!.height).toBe(before!.height);
});
