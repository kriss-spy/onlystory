import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('a declared missing NPC does not stop Fuuka scene playback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const initial = emptyData();
  initial.preferences.textSpeed = 0;
  initial.preferences.reducedMotion = true;
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    initial,
  );
  await page.goto('/read/ba/ba-jp-10018020?line=10018020%3A6');
  const scene = page.getByTestId('ba-scene');
  await expect(page.locator('.dialogue-window p')).toContainText('Amazing', {
    timeout: 20000,
  });
  await expect(scene).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /fuuka_spr:/,
  );
  await expect(
    page.getByRole('button', { name: 'Retry scene', exact: true }),
  ).toHaveCount(0);

  // Read normally through the screenshot's passage, retaining the same renderer.
  const chapter = await (
    await page.request.get('/private/ba-jp/10018020/chapter.json')
  ).json();
  const nodes = chapter.nodes;
  const first = nodes.findIndex(
    (node: { id: string }) => node.id === '10018020:6',
  );
  const last = nodes.findIndex(
    (node: { id: string }) => node.id === '10018020:43',
  );
  expect(last).toBeGreaterThan(first);
  for (let index = first + 1; index <= last; index++) {
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`line=${encodeURIComponent(nodes[index].id)}`),
    );
    await expect(scene).toHaveAttribute('aria-busy', 'false');
    await expect(
      page.getByRole('button', { name: 'Retry scene', exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.locator('.dialogue-window p')).toHaveText('Right.');
  await expect(page.locator('.ba-canvas')).toHaveAttribute(
    'data-characters',
    /fuuka_spr:/,
  );
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.cache/fuuka-scene-fixed.png' });
});
