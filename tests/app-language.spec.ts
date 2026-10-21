import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  data.preferences.voiceVolume = 0;
  data.preferences.musicVolume = 0;
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
});

test('app language persists and command search uses translated labels', async ({
  page,
}) => {
  await page.goto('/bookmarks');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('App language', { exact: true }).selectOption('zh-CN');
  await expect(page.getByLabel('应用语言', { exact: true })).toHaveValue(
    'zh-CN',
  );
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '收藏的段落', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '语言', exact: true }).click();
  await page.getByLabel('应用语言', { exact: true }).selectOption('ja');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(
    page.getByRole('heading', { name: '保存した台詞', exact: true }),
  ).toBeVisible();
  const preferences = await page.evaluate(
    () => JSON.parse(localStorage.getItem('onlystory.v1')!).preferences,
  );
  expect(preferences.textLocale).toBe('en');
  expect(preferences.catalogLocale).toBe('original');
  await page.keyboard.press('Control+k');
  await page.getByLabel('コマンドを検索', { exact: true }).fill('ブックマーク');
  await expect(
    page.getByRole('button', { name: 'ブックマーク', exact: true }),
  ).toBeVisible();
});

test('changing app language keeps the current story passage and text language', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=arrival');
  const dialogue = page.locator('.dialogue-window p');
  await expect(dialogue).toBeVisible();
  const before = await dialogue.textContent();
  const url = page.url();
  await page.keyboard.press('Control+,');
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('App language', { exact: true }).selectOption('ja');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'リーダー設定', exact: true }),
  ).toBeVisible();
  await expect(dialogue).toHaveText(before!);
  await expect(page).toHaveURL(url);
  const preferences = await page.evaluate(
    () => JSON.parse(localStorage.getItem('onlystory.v1')!).preferences,
  );
  expect(preferences.textLocale).toBe('en');
  expect(preferences.games?.ba?.textLocale).toBeUndefined();
});
