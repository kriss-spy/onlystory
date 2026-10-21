import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

for (const reducedMotion of [false, true]) {
  test(`question bubble plays its original sound with reduced motion ${reducedMotion}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const data = emptyData();
    data.preferences.textSpeed = 0;
    data.preferences.reducedMotion = reducedMotion;
    await page.addInitScript(
      (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
      data,
    );
    const choices = encodeURIComponent(
      JSON.stringify({ '11000:91': 's0', '11000:105': 's0' }),
    );
    await page.goto(
      `/read/ba/ba-jp-11000?line=11000%3A123&choices=${choices}`,
      { waitUntil: 'domcontentloaded' },
    );
    const host = page.locator('.ba-canvas');
    const scene = page.getByTestId('ba-scene');
    await expect(scene).toHaveAttribute('aria-busy', 'false', {
      timeout: 30000,
    });
    const audio = () =>
      host.evaluate((el) => (el as any).playbackDiagnostics.audio);
    // Reconstructing earlier bubbles while opening a passage must stay silent.
    expect((await audio()).playedSounds).toEqual([]);
    const enable = page.getByRole('button', {
      name: 'Enable scene audio',
      exact: true,
    });
    if (await enable.isVisible()) await enable.click();
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(page).toHaveURL(/line=11000%3A124/);
    await expect(
      page.locator('.ba-emotion[data-sprite="Emoji_QuestionMark"]'),
    ).toBeVisible();
    await expect
      .poll(async () => (await audio()).playedSounds)
      .toEqual(['SFX_Emoticon_Motion_Question']);
    expect((await audio()).context).toBe('running');
    expect((await audio()).soundVolume).toBeGreaterThan(0);
    await expect(scene).toHaveAttribute('aria-busy', 'false');
    await page
      .getByRole('button', { name: 'Previous passage', exact: true })
      .click();
    await expect(page).toHaveURL(/line=11000%3A123/);
    await expect(scene).toHaveAttribute('aria-busy', 'false');
    expect((await audio()).playedSounds).toEqual([
      'SFX_Emoticon_Motion_Question',
    ]);
  });
}
