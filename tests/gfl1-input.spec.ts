import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { emptyData } from '../src/model';

test('repeated background clicks advance through passage 18 without whitespace selections blocking input', async ({
  page,
}) => {
  test.skip(
    !existsSync('src/generated/gfl1-catalog.json'),
    'Import GFL1 first.',
  );
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
  await page.goto('/read/gfl1/gfl1--25-10-1?line=-25-10-1%3A16');
  await expect(page.getByTestId('gfl1-stage')).toBeVisible();
  const bounds = (await page
    .getByRole('region', { name: 'Story reader' })
    .boundingBox())!;
  // Mouse click counts match the browser's double/triple-click events when
  // someone keeps reading by clicking the same part of the background.
  for (const [index, count] of [1, 2, 3, 1, 2, 3, 1, 2, 3].entries()) {
    await page.mouse.move(bounds.x + 30, bounds.y + 30);
    await page.mouse.down({ clickCount: count });
    await page.mouse.up({ clickCount: count });
    await expect
      .poll(() => new URL(page.url()).searchParams.get('line'))
      .toBe(`-25-10-1:${17 + index}`);
  }
});

test('GFL1 dialogue remains selectable and reading resumes after clearing the selection', async ({
  page,
}) => {
  test.skip(
    !existsSync('src/generated/gfl1-catalog.json'),
    'Import GFL1 first.',
  );
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
  await page.goto('/read/gfl1/gfl1--25-10-1?line=-25-10-1%3A18');
  const first = (await page
    .locator('.dialogue-window p span')
    .first()
    .boundingBox())!;
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 180, first.y + first.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  expect(
    await page.evaluate(() => getSelection()?.toString().trim().length),
  ).toBeGreaterThan(0);
  await expect(page).toHaveURL(/line=-25-10-1%3A18/);
  const stage = page.getByTestId('gfl1-stage');
  await stage.click({ position: { x: 30, y: 30 } });
  await expect(page).toHaveURL(/line=-25-10-1%3A18/);
  await stage.click({ position: { x: 30, y: 30 } });
  await expect(page).toHaveURL(/line=-25-10-1%3A19/);
});
