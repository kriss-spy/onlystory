import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('real event NPC neutral poses, alternate costume faces and missing-face reconstruction render', async ({
  page,
}) => {
  test.setTimeout(90000);
  const data = emptyData();
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 0;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
  const open = async (
    group: number,
    row: number,
    choices: Record<string, string> = {},
  ) => {
    await page.goto(
      `/read/ba/ba-jp-${group}?line=${group}%3A${row}&choices=${encodeURIComponent(JSON.stringify(choices))}`,
    );
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    return page
      .locator('.ba-canvas')
      .evaluate((element: any) => element.playbackDiagnostics);
  };
  const npc = await open(10000010, 2);
  expect(npc.state.actors['행인 B 웰시'].face).toBe('');
  expect(npc.state.actors['행인 B 웰시'].requestedFace).toBe('00');
  const alternate = await open(10001005, 55, {
    '10001005:14': 's0',
    '10001005:20': 's1',
    '10001005:45': 's0',
  });
  expect(alternate.state.actors['체리노'].face).toBe('S2_05');
  const choices = Object.fromEntries(
    [3, 10, 18, 28].map((row) => [`10000095:${row}`, 's0']),
  );
  const missing = await open(10000095, 44, choices);
  expect(missing.state.actors['이즈나 무소속'].face).toBe('01');
  expect(missing.state.actors['이즈나 무소속'].requestedFace).toBe('61');
  expect(missing.expressionWarnings).toContain(
    'izuna_spr: missing expression 61; kept previous expression',
  );
});
