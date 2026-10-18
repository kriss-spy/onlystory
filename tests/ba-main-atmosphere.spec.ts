import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test.setTimeout(90000);
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
});

// Run new metadata through the real prologue renderer while main assets package.
// This fixture changes only the selected row's atmosphere, keeping original art.
for (const [id, backgroundFilter, actorFilter, layerName] of [
  [3538076526, 'grayscale(1)', '', ''],
  [356899549, 'grayscale(1)', 'grayscale(1)', ''],
  [3580094783, 'grayscale(1)', 'grayscale(1)', ''],
  [2675527592, '', '', 'BG_Snow_L'],
  [1645868105, '', '', 'BG_ScrollB_1.0'],
  [500704592, '', '', 'BG_Film_Grain_BG'],
] as const) {
  test(`main atmosphere ${id} renders and clears while advancing`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/11000/scenes.json*', async (route) => {
      const response = await route.fetch();
      const program = await response.json();
      for (const step of program.steps)
        for (const row of step.rows) row.BGEffect = row.row === 90 ? id : 0;
      await route.fulfill({ response, json: program });
    });
    await page.goto('/read/ba/ba-jp-11000?line=11000%3A90');
    const scene = page.getByTestId('ba-scene');
    await expect(scene).toHaveAttribute('aria-busy', 'false', {
      timeout: 45000,
    });
    const background = page.locator('.ba-background');
    const actors = page.locator('.ba-actors');
    expect(
      await background.evaluate((node) => (node as HTMLElement).style.filter),
    ).toContain(backgroundFilter);
    expect(
      await actors.evaluate((node) => (node as HTMLElement).style.filter),
    ).toBe(actorFilter);
    if (layerName) {
      const layer = page.locator(`[data-native-effect="${layerName}"]`);
      await expect(layer).toHaveCount(1);
      if (layerName === 'BG_Film_Grain_BG')
        expect(
          await layer.evaluate((node) =>
            node.parentElement?.classList.contains('ba-canvas'),
          ),
        ).toBe(true);
      if (layerName === 'BG_Snow_L')
        await expect(layer.locator('.ba-main-atmosphere-particle')).toHaveCount(
          24,
        );
    }
    await page.screenshot({ path: info.outputPath(`atmosphere-${id}.png`) });
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(scene).toHaveAttribute('aria-busy', 'false', {
      timeout: 10000,
    });
    await expect(page.locator('.ba-main-atmosphere-layer')).toHaveCount(0);
    expect(
      await background.evaluate((node) => (node as HTMLElement).style.filter),
    ).toBe('');
    expect(
      await actors.evaluate((node) => (node as HTMLElement).style.filter),
    ).toBe('');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
