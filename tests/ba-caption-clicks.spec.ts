import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';
for (const locale of ['en', 'ja'] as const) {
  test(`letter reveals one paragraph per click in ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const data = emptyData();
    data.preferences.textLocale = locale;
    data.preferences.textSpeed = 45;
    await page.setViewportSize({ width: 612, height: 826 });
    await page.addInitScript(
      (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
      data,
    );
    await page.goto('/read/ba/ba-jp-11010?line=11010%3A7', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('ba-scene')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await page
      .getByRole('button', {
        name: locale === 'en' ? 'Read the letter.' : '手紙を読む',
        exact: false,
      })
      .click();
    for (const [rows, end] of [
      [[10, 12, 14, 16, 18], 20],
      [[22, 24, 26, 28, 30], 32],
      [[34, 36], 39],
    ] as const) {
      if (rows[0] !== 10) {
        await page
          .getByRole('button', { name: 'Next passage', exact: true })
          .click();
      }
      for (const [index, row] of rows.entries()) {
        await expect(page).toHaveURL(new RegExp(`line=11010%3A${row}`));
        await expect(page.locator('.ba-captions > p')).toHaveCount(index + 1, {
          timeout: 500,
        });
        await expect
          .poll(() =>
            page.locator('.ba-captions > p').evaluateAll((elements) =>
              elements.every((element) => {
                const box = element.getBoundingClientRect();
                return (
                  parseFloat(getComputedStyle(element).fontSize) >= 14 &&
                  box.height >= 20
                );
              }),
            ),
          )
          .toBe(true);
        await expect(page.getByTestId('ba-scene')).toHaveAttribute(
          'aria-busy',
          'false',
          { timeout: 500 },
        );
        await expect(
          page.getByRole('button', { name: 'Next passage', exact: true }),
        ).toBeVisible({ timeout: 500 });
        await expect(
          page.getByText('Scene playing…', { exact: true }),
        ).toHaveCount(0);
        if (index === 0) {
          // Neither the authored pauses nor text speed may advance a paragraph.
          await page.waitForTimeout(1800);
          await expect(page).toHaveURL(new RegExp(`line=11010%3A${row}`));
          await expect(page.locator('.ba-captions > p')).toHaveCount(1);
        }
        if (row === 24)
          await page.screenshot({
            path: info.outputPath('two-readable-paragraphs.png'),
          });
        await page
          .getByRole('button', { name: 'Next passage', exact: true })
          .click();
      }
      await expect(page).toHaveURL(new RegExp(`line=11010%3A${end}`));
      if (end !== 39) {
        await expect(
          page.getByRole('button', { name: 'Next passage', exact: true }),
        ).toBeVisible();
      }
    }
  });
}
