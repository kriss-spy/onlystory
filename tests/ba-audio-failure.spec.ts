import { test, expect } from '@playwright/test';

for (const failure of ['initialization', 'decoding'] as const) {
  test(`BA keeps original visuals when audio ${failure} fails`, async ({
    page,
  }) => {
    await page.addInitScript((failure) => {
      if (failure === 'initialization') {
        window.AudioContext = class {
          constructor() {
            throw new Error('Audio hardware unavailable');
          }
        } as typeof AudioContext;
      } else {
        AudioContext.prototype.decodeAudioData = () =>
          Promise.reject(new Error('Audio format unavailable'));
      }
    }, failure);
    await page.goto('/read/ba/ba-jp-42010?line=42010%3A0');
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      {
        timeout: 20000,
      },
    );
    await expect(
      page.getByRole('button', { name: 'Read text instead', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.ba-actors')).toBeVisible();
  });
}
