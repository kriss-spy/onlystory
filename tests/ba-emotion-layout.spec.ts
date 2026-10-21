import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('prologue emotions use green question art and remain beside the rendered face', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  data.preferences.reducedMotion = true;
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    data,
  );
  const choices = encodeURIComponent(
    JSON.stringify({
      '11000:91': 's0',
      '11000:105': 's0',
      '11000:158': 's0',
      '11000:164': 's0',
      '11000:169': 's0',
      '11000:190': 's1',
      '11000:222': 's3',
    }),
  );
  for (const row of [124, 132, 141, 145, 146, 180, 195, 228]) {
    await page.goto(
      `/read/ba/ba-jp-11000?line=11000%3A${row}&choices=${choices}`,
    );
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    const emotion = page.locator('.ba-emotion').first();
    await expect(emotion).toBeVisible();
    if (row === 124)
      await expect(emotion).toHaveAttribute(
        'data-sprite',
        'Emoji_QuestionMark',
      );
    if (row === 141) {
      await expect(emotion).toHaveAttribute('data-sprite', 'Emoji_Aggro');
      await expect(emotion.locator('img')).toHaveCount(3);
    }
    if (row === 132) {
      await expect(emotion).toHaveAttribute('data-sprite', 'Emoji_Action');
      await expect(emotion.locator('img')).toHaveCount(3);
    }
    if (row === 145) {
      await expect(emotion).toHaveAttribute('data-sprite', 'Emoji_Exclamation');
      await expect(emotion.locator('img')).toHaveCount(2);
    }
    for (const viewport of [
      { width: 1598, height: 1000 },
      { width: 1024, height: 700 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () =>
          page.locator('.ba-canvas').evaluate((host) => {
            const canvas = host.getBoundingClientRect();
            const el = host.querySelector('.ba-emotion') as HTMLElement;
            const face = (host as any).playbackDiagnostics.emotionFaces?.[
              el?.dataset.character ?? ''
            ];
            if (!face || !el) return false;
            const rect = el.getBoundingClientRect();
            const left = rect.left - canvas.left,
              right = rect.right - canvas.left;
            return (
              (right <= face.left || left >= face.right) &&
              rect.top >= canvas.top &&
              rect.left >= canvas.left &&
              rect.right <= canvas.right
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`${row}-${viewport.width}.png`),
      });
    }
  }
});
