import { test, expect } from '@playwright/test';

for (const view of [
  {
    path: '/games/pjsk',
    label: 'Search events',
    candidates: ['y', 'yu', '雨'],
  },
  {
    path: '/games/pjsk/events/pjsk-cn-event-1',
    label: 'Search stories',
    candidates: ['h', 'hitori', 'ひとり'],
  },
]) {
  test(`${view.label} preserves native IME composition and URL navigation`, async ({
    page,
  }) => {
    await page.goto(`${view.path}?sort=title`);
    const search = page.getByRole('searchbox', {
      name: view.label,
      exact: true,
    });
    await search.focus();
    const cdp = await page.context().newCDPSession(page);
    const before = page.url();
    for (const text of view.candidates) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await expect(search).toHaveValue(text);
      await expect(search).toBeFocused();
      expect(page.url()).toBe(before);
    }
    const committed = view.candidates.at(-1)!;
    await cdp.send('Input.insertText', { text: committed });
    await expect(search).toHaveValue(committed);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe(committed);
    expect(new URL(page.url()).searchParams.get('sort')).toBe('title');
    await search.fill('Rain');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe('Rain');
    await search.fill('');
    await expect
      .poll(() => new URL(page.url()).searchParams.has('q'))
      .toBe(false);
    await search.fill(committed);
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await page.goBack();
    await expect(search).toHaveValue(committed);
    await page.goForward();
    await expect(page).toHaveURL(/\/library$/);
    await page.goBack();
    await page.reload();
    await expect(search).toHaveValue(committed);
    await cdp.detach();
  });
}
