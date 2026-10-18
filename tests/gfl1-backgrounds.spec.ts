import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { emptyData } from '../src/model';
import { mkdirSync } from 'node:fs';

const manifestPath = '.cache/gfl1/extracted.json';
const extraction = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : undefined;
test.beforeEach(async ({ page }) => {
  test.skip(
    !extraction?.scripts['-1-4-1'],
    'Import the GFL1 event milestone first.',
  );
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
});

test('Cube gameplay-underlay rows retain a real background through seeking and reload', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--1-4-1?line=-1-4-1%3A19');
  const stage = page.getByTestId('gfl1-stage');
  await expect(stage).toBeVisible();
  await expect(stage.locator(':scope > .scene-background')).not.toHaveAttribute(
    'src',
    extraction.backgrounds['10'].url,
  );
  await expect(stage.locator(':scope > .scene-background')).toHaveAttribute(
    'src',
    /\/private\/gfl1\//,
  );
  await expect(
    stage.getByRole('img', { name: 'HK416, expression 0', exact: true }),
  ).toBeVisible();
  await expect(stage.locator(':scope > .scene-background')).toHaveAttribute(
    'src',
    extraction.gameplayBackgrounds['-1-4-1'].url,
  );
  await expect(stage.locator('.gfl1-background-shade')).toBeVisible();
  await expect
    .poll(() =>
      stage
        .locator(':scope > .scene-background')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(2048);
  mkdirSync('.cache/gfl1/qa', { recursive: true });
  await page.screenshot({ path: '.cache/gfl1/qa/cube-terrain-fixed.png' });
  await page.reload();
  await expect(stage.locator(':scope > .scene-background')).not.toHaveAttribute(
    'src',
    extraction.backgrounds['10'].url,
  );
});

test('The Last Day ends in black, preserves it under reduced motion, and clears on rewind', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1--24-8-1?line=-24-8-1%3A88');
  const stage = page.getByTestId('gfl1-stage');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS('opacity', '1');
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS('opacity', '1');
  await page.goto('/read/gfl1/gfl1--24-8-1?line=-24-8-1%3A86');
  await expect(stage.locator('.gfl1-curtain')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS(
    'animation-duration',
    '0.6s',
  );
  const opacity = await stage.locator('.gfl1-curtain').evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 300;
    return Number(getComputedStyle(element).opacity);
  });
  expect(opacity).toBeGreaterThan(0);
  expect(opacity).toBeLessThan(1);
  await stage.locator('.gfl1-curtain').evaluate((element) => {
    element.getAnimations()[0].currentTime = 600;
  });
  await expect(stage.locator('.gfl1-curtain')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '.cache/gfl1/qa/ct-ending-black-fixed.png' });
});
