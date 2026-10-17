import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import { emptyData } from '../src/model';
import type { Program } from '../src/playback/pjsk/types';

test('earlier characters still animate after loading a thirteen-model episode', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const episode = JSON.parse(
    readFileSync('src/generated/pjsk-cn-event-1000017.json', 'utf8'),
  );
  const program: Program = JSON.parse(
    readFileSync(pjskLibraryRoot + episode.renderer.payload.url, 'utf8'),
  );
  expect(Object.keys(program.media.models).length).toBe(13);
  const middle = Math.floor(program.steps.length / 2);
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        voiceVolume: 0,
        musicVolume: 0,
        soundVolume: 0,
        reducedMotion: false,
      },
    },
  );
  await page.goto(
    `/read/pjsk/${episode.id}?line=${encodeURIComponent(program.steps[middle].id)}`,
  );
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 90000 },
  );
  const visible = await page.getByTestId('pjsk-layers').evaluate((el) =>
    (
      el as HTMLElement & {
        playbackDiagnostics: {
          models: { costume: string; visible: boolean }[];
        };
      }
    ).playbackDiagnostics.models
      .filter((model) => model.visible)
      .map((model) => model.costume),
  );
  expect(visible.sort()).toEqual(['14emu_cloth001', '15nene_cloth001']);
  await page.waitForTimeout(200);
  const before = await page.locator('canvas').screenshot();
  await page.waitForTimeout(750);
  const after = await page.locator('canvas').screenshot({
    path: testInfo.outputPath('animated-characters.png'),
  });
  expect(
    before.equals(after),
    'Visible earlier models froze after later models expanded the Live2D heap',
  ).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
