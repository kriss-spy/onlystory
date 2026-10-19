import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const graphics = (page: Page) =>
  page.getByTestId('native-layers').evaluate(
    (el) =>
      (
        el as HTMLElement & {
          playbackDiagnostics?: {
            graphics: { id: string; alpha: number; visible: boolean }[];
          };
        }
      ).playbackDiagnostics?.graphics ?? [],
  );

test('a delayed outgoing CG is redrawn and stays visible during normal next-passage playback', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-ilion-34511?line=M23027%3A152');
  await expect
    .poll(async () =>
      (await graphics(page)).some(
        (g) => g.id === 'CG_55_Dragoon' && g.alpha > 0,
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page).toHaveURL(/line=M23027%3A156/);
  const started = Date.now();
  await expect
    .poll(
      async () =>
        Date.now() - started > 2200 &&
        (await graphics(page)).some(
          (g) => g.id === 'CG_55_Dragoon' && g.visible && g.alpha === 1,
        ),
      { timeout: 10000 },
    )
    .toBe(true);
});

test('normal playback retains every separately shaded piece of the mirror CG', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-ilion-34408?line=M22022%3A319');
  await expect(
    page.getByTestId('native-layers').locator('canvas'),
  ).toBeVisible();
  // Canvas creation precedes loading the starting scene's assets.
  await expect
    .poll(() =>
      page.getByTestId('native-layers').evaluate((element) => {
        const state = (
          element as HTMLElement & {
            playbackDiagnostics?: { loaded: string[]; pending: string[] };
          }
        ).playbackDiagnostics;
        return !!state?.loaded.length && state.pending.length === 0;
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page).toHaveURL(/line=M22022%3A372/);
  const expected = Array.from(
    { length: 7 },
    (_, i) => `CG_52_Mirror_0${i + 1}`,
  );
  await expect
    .poll(
      async () =>
        (await graphics(page))
          .filter((g) => expected.includes(g.id) && g.visible && g.alpha === 1)
          .map((g) => g.id),
      { timeout: 15000 },
    )
    .toEqual(expect.arrayContaining(expected));
});
