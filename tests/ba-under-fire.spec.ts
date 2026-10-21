import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('festival chapter 8 gunfire uses transparent ground impacts and animated smoke', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    data,
  );
  // Extend only the capture window; exercise the actual source effect and media.
  await page.route('**/ba-jp/10000080/scenes.json', async (route) => {
    const response = await route.fetch();
    const program = await response.json();
    for (const step of program.steps)
      for (const row of step.rows)
        if (row.row === 1)
          row.ScriptKr = row.ScriptKr.replace('#wait;1500', '#wait;15000');
    await route.fulfill({ response, json: program });
  });
  await page.goto('/read/ba/ba-jp-10000080?line=10000080%3A0');
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 45000 },
  );
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page.locator('.ba-fireline').first()).toBeVisible({
    timeout: 45000,
  });
  const alpha = await page
    .locator('.ba-fireline')
    .first()
    .evaluate(async (el) => {
      const img = el as HTMLImageElement;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, 1, 1).data[3];
    });
  expect(
    alpha,
    'additive textures must have transparent background pixels',
  ).toBeLessThan(10);
  await expect(page.locator('.ba-impact')).toHaveCount(10);
  await expect(page.locator('.ba-impact-smoke')).toHaveCount(20);
  await expect
    .poll(() =>
      page
        .locator('.ba-canvas')
        .evaluate((host) =>
          (host as any).playbackDiagnostics.audio.playedSounds.includes(
            'UI_FX_BG_UnderFire',
          ),
        ),
    )
    .toBe(true);
  const liveAudio = await page
    .locator('.ba-canvas')
    .evaluate((host) => (host as any).playbackDiagnostics.audio);
  expect(liveAudio.context).toBe('running');
  expect(liveAudio.sounds).toBeGreaterThan(0);
  expect(liveAudio.soundVolume).toBeGreaterThan(0);
  const volley = await page.locator('.ba-impact').evaluateAll((elements) =>
    elements.map((element) => ({
      x: parseFloat((element as HTMLElement).style.left),
      delay: Number(element.getAnimations()[0].effect!.getTiming().delay),
    })),
  );
  expect(volley[0].x).toBeGreaterThan(85);
  expect(volley.at(-1)!.x).toBeLessThan(10);
  for (let i = 1; i < volley.length; i++) {
    expect(volley[i].x).toBeLessThan(volley[i - 1].x);
    expect(volley[i].delay).toBeGreaterThan(volley[i - 1].delay);
  }
  const positions = await page.locator('.ba-particles').evaluate((host) => {
    const animations = host.getAnimations({ subtree: true });
    return [150, 850].map((time) => {
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = time;
      }
      const active = [
        ...host.querySelectorAll<HTMLElement>('.ba-impact'),
      ].filter((element) => Number(getComputedStyle(element).opacity) > 0.25);
      return (
        active.reduce(
          (sum, element) => sum + parseFloat(element.style.left),
          0,
        ) / active.length
      );
    });
  });
  expect(
    positions[0] - positions[1],
    'visible shots must travel from right to left',
  ).toBeGreaterThan(50);
  await page.locator('.ba-particles').evaluate((host) => {
    for (const animation of host.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 350;
    }
  });
  await page.screenshot({ path: info.outputPath('underfire.png') });
  await page.getByRole('button', { name: 'Finish scene', exact: true }).click();
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.locator('.ba-impact')).toHaveCount(0);
  expect(
    await page
      .locator('.ba-canvas')
      .evaluate((host) => (host as any).playbackDiagnostics.audio.sounds),
  ).toBe(0);
  const answers = Object.fromEntries(
    [91, 105, 158, 164, 169].map((row) => [`11000:${row}`, 's0']),
  );
  answers['11000:190'] = 's1';
  await page.goto(
    `/read/ba/ba-jp-11000?line=11000%3A208&choices=${encodeURIComponent(JSON.stringify(answers))}`,
  );
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 45000 },
  );
  await expect(page.locator('.ba-fireline')).toHaveCount(4);
  expect(
    await page
      .locator('.ba-canvas')
      .evaluate((host) => (host as any).playbackDiagnostics.audio.playedSounds),
  ).not.toContain('UI_FX_BG_UnderFire');
  expect(
    await page
      .locator('.ba-particles')
      .evaluate((host) =>
        host
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === 'finished'),
      ),
  ).toBe(true);
});
