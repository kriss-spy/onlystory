import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';

test('BA response choices substitute the name in Japanese and English', async ({
  page,
}) => {
  const data = emptyData();
  data.preferences.games = {
    ba: {
      playerName: 'Koul$&',
      textLocale: 'en',
      layout: 'text',
      textSpeed: 0,
    },
  };
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    data,
  );
  await page.goto('/read/ba/ba-jp-10045010?line=10045010%3A25');
  await expect(
    page.getByRole('button', {
      name: '"Uh... Hello, everyone. I\'m Koul$&."',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Reading language', exact: true })
    .selectOption('ja');
  await expect(
    page.getByRole('button', {
      name: '"えー、皆さん、こんにちは。Koul$&です。"',
      exact: true,
    }),
  ).toBeVisible();
});

test('BA screen captions use the configured name and update in place and after reload', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const data = emptyData();
  data.preferences.playerName = 'Global name';
  data.preferences.games = {
    ba: {
      playerName: 'Koul',
      textLocale: 'ja',
      textSpeed: 0,
      reducedMotion: true,
    },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, data);
  await page.goto('/read/ba/ba-jp-41030?line=41030%3A193');
  const captions = page.locator('.ba-captions');
  await expect(captions).toContainText('担当者：シャーレ Koul先生', {
    timeout: 45000,
  });
  const passage = page.url();
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await page.getByLabel('Player name', { exact: true }).fill('名😀$&[b]#n');
  await expect(captions).toContainText('担当者：シャーレ 名😀$&[b]#n先生');
  await expect(page).toHaveURL(passage);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(captions).toContainText('担当者：シャーレ 名😀$&[b]#n先生');
  await expect(captions).not.toContainText('[USERNAME]');
  await page.screenshot({
    path: info.outputPath('configured-player-name.png'),
  });
});
