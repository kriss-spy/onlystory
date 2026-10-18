import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('BA dialogue honors authored pauses and Reveal text still completes it', async ({
  page,
}) => {
  const data = emptyData();
  data.preferences.layout = 'text';
  data.preferences.textLocale = 'ja';
  data.preferences.textSpeed = 20;
  await page.addInitScript(
    (value) => localStorage.setItem('onlystory.v1', JSON.stringify(value)),
    data,
  );
  await page.route('**/private/ba-jp/11000/chapter.json*', async (route) => {
    const response = await route.fetch();
    const chapter = await response.json();
    const node = chapter.nodes.find((node: any) => node.kind === 'text');
    node.text = { en: 'あいう', 'zh-CN': 'あいう', ja: 'あいう' };
    node.scene.textPauses = [{ offset: 1, delay: 800 }];
    await route.fulfill({ response, json: chapter });
  });
  await page.goto('/read/ba/ba-jp-11000');
  const dialogue = page.locator('.dialogue-window p');
  await expect(dialogue.locator('span').nth(0)).toHaveCSS('opacity', '1');
  await expect(dialogue.locator('span').nth(1)).toHaveCSS('opacity', '0');
  await page.waitForTimeout(300);
  await expect(dialogue.locator('span').nth(1)).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await expect(dialogue).toHaveText('あいう');
  await expect(dialogue.locator('span').nth(2)).toHaveCSS('opacity', '1');
});
