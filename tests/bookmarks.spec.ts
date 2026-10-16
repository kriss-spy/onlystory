import { test, expect } from '@playwright/test';

test('reader bookmark icon removes only the current passage within the same session', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-event-3478101?line=A33001%3A6');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  for (const index of [0, 1, 2]) {
    await position.fill(String(index));
    await page
      .getByRole('button', { name: 'Bookmark passage', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Remove bookmark', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await position.fill('1');
  await page
    .getByRole('button', { name: 'Remove bookmark', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Bookmark passage', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  for (const index of [0, 2]) {
    await position.fill(String(index));
    await expect(
      page.getByRole('button', { name: 'Remove bookmark', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await page.goto('/bookmarks');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.bookmark-item')).toHaveCount(2);
});

test('removing one real story bookmark preserves the other passages after reload', async ({
  page,
}) => {
  await page.goto('/read/gfl2/gfl2-event-3478101?line=A33001%3A6');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  for (const index of [0, 1, 2]) {
    await position.fill(String(index));
    await page
      .getByRole('button', { name: 'Bookmark passage', exact: true })
      .click();
  }
  await page.goto('/bookmarks');
  const items = page.locator('.bookmark-item');
  await expect(items).toHaveCount(3);
  const removed = await items.nth(1).getByRole('link').getAttribute('href');
  const retained = await items
    .getByRole('link')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .filter((href, index) => index !== 1),
    );
  await items
    .nth(1)
    .getByRole('button', { name: 'Remove bookmark', exact: true })
    .click();
  await expect(items).toHaveCount(2);
  await expect(page.locator(`.bookmark-item a[href="${removed}"]`)).toHaveCount(
    0,
  );
  expect(
    await items
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual(retained);
  await page.reload();
  await expect(items).toHaveCount(2);
  await page.getByRole('link', { name: /2074年/ }).click();
  await page
    .getByRole('button', { name: 'Remove bookmark', exact: true })
    .click();
  await page.goto('/bookmarks');
  await expect(items).toHaveCount(1);
});
