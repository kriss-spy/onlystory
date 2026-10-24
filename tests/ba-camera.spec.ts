import { test, expect, type Page } from '@playwright/test';
import { emptyData } from '../src/model';

const link = (row: number) =>
  `/read/ba/ba-jp-41085?line=41085%3A${row}&choices=${encodeURIComponent(JSON.stringify({ '41085:20': 's0', '41085:47': 's0', '41085:169': 's1' }))}`;
const ready = (page: Page) =>
  expect(page.getByTestId('ba-scene')).toHaveAttribute('aria-busy', 'false', {
    timeout: 45000,
  });
const framing = (page: Page) =>
  page.locator('.ba-background').evaluate((background) => {
    const matrix = new DOMMatrix(getComputedStyle(background).transform);
    return {
      scale: matrix.a,
      x: matrix.e,
      y: matrix.f,
      animations: background.getAnimations().length,
    };
  });

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
});

test('Operation Carrot plays both pans and returns to the whole CG', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto(link(195));
  await ready(page);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect
    .poll(
      async () => {
        const frame = await framing(page);
        return frame.scale > 2 && frame.x > 0;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  // The second close-up must replace the completed first pan. Its positive
  // source X moves the image left; the first pan ends on the opposite side.
  await expect
    .poll(
      async () => {
        const frame = await framing(page);
        return frame.scale > 2 && frame.x < 0;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await expect(page.locator('.ba-transition')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: info.outputPath('second-closeup.png') });
  await ready(page);
  expect(await framing(page)).toEqual({ scale: 1, x: 0, y: 0, animations: 0 });
  await page.screenshot({ path: info.outputPath('whole-cg.png') });
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await ready(page);
  expect(await framing(page)).toEqual({ scale: 1, x: 0, y: 0, animations: 0 });
});

test('seeking and reloading the reported dialogue reconstructs the full frame', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(link(209));
  await ready(page);
  await page
    .getByRole('combobox', { name: 'Reading language', exact: true })
    .selectOption('en');
  await ready(page);
  expect(await framing(page)).toEqual({ scale: 1, x: 0, y: 0, animations: 0 });
  await page.reload();
  await ready(page);
  expect(await framing(page)).toEqual({ scale: 1, x: 0, y: 0, animations: 0 });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.screenshot({
    path: info.outputPath('reported-dialogue-narrow.png'),
  });
  expect(await framing(page)).toEqual({ scale: 1, x: 0, y: 0, animations: 0 });
});
