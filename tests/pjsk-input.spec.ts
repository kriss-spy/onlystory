import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

for (const input of ['background', 'Space'] as const) {
  test(`${input} advances while event 150 scene commands are still pending`, async ({
    page,
  }) => {
    test.setTimeout(120000);
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
        },
      },
    );
    await page.goto('/read/pjsk/pjsk-cn-event-1001219?line=event_150_01%3A56');
    const stage = page.getByTestId('scene-stage');
    await expect(stage).toHaveAttribute('aria-busy', 'false', {
      timeout: 90000,
    });
    const advance = async () => {
      if (input === 'background')
        await page.locator('canvas').click({ position: { x: 100, y: 100 } });
      else await page.keyboard.press('Space');
    };
    await advance();
    await expect(page).toHaveURL(/line=event_150_01%3A64/);
    await expect(stage).toHaveAttribute('aria-busy', 'true');
    await advance();
    await expect(page).toHaveURL(/line=event_150_01%3A71/, { timeout: 750 });
    await expect(stage).toHaveAttribute('aria-busy', 'false', {
      timeout: 1000,
    });
    // The canceled 3 s / 6.5 s commands must not overwrite the destination.
    await page.waitForTimeout(11000);
    await expect(page).toHaveURL(/line=event_150_01%3A71/);
    await expect(stage).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
