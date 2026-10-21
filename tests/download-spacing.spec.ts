import { expect, test } from '@playwright/test';

test('download instructions keep spaces around sizes and file counts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let reads = 0;
    Object.defineProperty(window, 'onlystoryDesktop', {
      value: {
        readOriginal: async () =>
          ++reads === 1 ? new ArrayBuffer(0) : new Promise(() => {}),
        cancelDownloads: async () => {},
      },
    });
  });
  await page.goto('/downloads/ba-jp-11000', { waitUntil: 'domcontentloaded' });
  const originals = page.locator('section[aria-labelledby="originals-title"]');
  await expect(
    page.getByRole('button', { name: 'Download and import', exact: true }),
  ).toBeVisible();
  const total = await originals.locator('.source-files li').count();
  expect(total).toBeGreaterThan(0);
  await expect(page.locator('.page-title')).toContainText(
    /About \d+(?:\.\d+)? (?:KB|MB) of original files\./,
  );
  await expect(originals.getByRole('status')).toHaveText(
    `0 / ${total} original files selected.`,
  );
  await expect(originals.locator('summary')).toHaveText(
    `Source files · ${total} remaining`,
  );
  await page
    .getByRole('button', { name: 'Download and import', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({
        has: page.getByRole('progressbar', { name: 'Story download progress' }),
      })
      .locator('p')
      .first(),
  ).toHaveText(`Downloading original files · 1 / ${total} files`);
});

test('event counts and undated collection notes keep word boundaries', async ({
  page,
}) => {
  await page.goto('/games/pjsk/events/pjsk-cn-idol-main');
  await expect(page.locator('.event-summary')).toHaveText(
    /\d+ stor(?:y|ies)(?: ·|$)/,
  );
  await page.goto('/games/ba?sort=release');
  await expect(page.locator('.release-order-note')).toHaveText(
    /^\d+ collections? ha(?:s|ve) no release date in the imported source\./,
  );
});
