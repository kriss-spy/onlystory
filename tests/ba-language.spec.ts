import { test, expect } from '@playwright/test';
import { emptyData } from '../src/model';
import chapter from '../public/private/ba-jp/11000/chapter.json' with { type: 'json' };
import japaneseOnlyChapter from '../public/private/ba-jp/211020/chapter.json' with { type: 'json' };

test.setTimeout(90000);
const reader = '/read/ba/ba-jp-11000';
const choices = Object.fromEntries(
  [91, 105, 158, 164, 169].map((row) => [`11000:${row}`, 's0']),
);
const choiceLink = `${reader}?line=11000%3A190&choices=${encodeURIComponent(JSON.stringify(choices))}`;

test('real JP/EN dialogue and choices switch at the same passage, then resume the selected branch in English', async ({
  page,
}, info) => {
  const initial = emptyData();
  initial.preferences.games = {
    ba: { textLocale: 'ja', textSpeed: 0, reducedMotion: true },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, initial);
  await page.goto(choiceLink);
  const language = page.getByRole('combobox', {
    name: 'Reading language',
    exact: true,
  });
  const prompt = chapter.nodes.find((node) => node.id === '11000:190')!;
  await expect(
    page.getByRole('button', {
      name: prompt.choices![0].label.ja,
      exact: true,
    }),
  ).toBeVisible();
  const before = page.url();
  await language.selectOption('en');
  await expect(page).toHaveURL(before);
  await expect(
    page.getByRole('button', {
      name: prompt.choices![0].label.en,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: prompt.choices![0].label.en, exact: true })
    .click();
  await expect(page).toHaveURL(/line=11000%3A191/);
  const response = chapter.nodes.find((node) => node.id === '11000:191')!;
  await expect(page.locator('.speaker-row')).toContainText(
    response.speakerLocales!.en,
  );
  await expect(page.locator('.dialogue-window p')).toHaveText(response.text.en);
  const branch = page.url();
  await language.selectOption('ja');
  await expect(page).toHaveURL(branch);
  await expect(page.locator('.dialogue-window p')).toHaveText(
    response.text.ja!,
  );
  await language.selectOption('en');
  await page.reload();
  await expect(language).toHaveValue('en');
  await expect(page.locator('.dialogue-window p')).toHaveText(response.text.en);
  await page.goto(reader);
  await expect(page).toHaveURL(/line=11000%3A191/);
  await expect(page.locator('.dialogue-window p')).toHaveText(response.text.en);
  await page.screenshot({
    path: info.outputPath('ba-english-branch-resume.png'),
  });
});

test('official English also replaces authored screen captions and JA-only source gaps offer no English selector', async ({
  page,
}) => {
  await page.goto(reader + '?line=11000%3A4');
  const language = page.getByRole('combobox', {
    name: 'Reading language',
    exact: true,
  });
  await language.selectOption('en');
  await expect(page.locator('.ba-captions')).toContainText(
    'We thirst for the seven wailings.',
  );
  await language.selectOption('ja');
  await expect(page.locator('.ba-captions')).toContainText('我々は望む');
  await page.goto('/read/ba/ba-jp-13370');
  await expect(page.getByTestId('ba-scene')).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Reading language', exact: true }),
  ).toHaveCount(0);
});

test('reader settings list only supported dialogue languages and retain the preference for other stories', async ({
  page,
}, info) => {
  const initial = emptyData();
  initial.preferences = {
    ...initial.preferences,
    layout: 'text',
    textLocale: 'en',
    catalogLocale: 'en',
    textSpeed: 0,
    reducedMotion: true,
    games: { ba: { textLocale: 'en', catalogLocale: 'en' } },
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(data));
  }, initial);

  const japanese = japaneseOnlyChapter.nodes.find(
    (node) => node.id === '211020:38',
  )!;
  expect(japanese.text.en).toBe('');
  await page.goto('/read/ba/ba-jp-211020?line=211020%3A38');
  const dialogue = page.locator('.dialogue-window p');
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toHaveText(japanese.text.ja);
  const japanesePassage = page.url();

  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  const textLanguage = page.getByRole('combobox', {
    name: 'Text language',
    exact: true,
  });
  const catalogLanguage = page.getByRole('combobox', {
    name: 'Catalog language',
    exact: true,
  });
  await expect(textLanguage).toHaveValue('ja');
  await expect(textLanguage.locator('option')).toHaveText(['日本語']);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('onlystory.v1')!).preferences.games.ba
          .textLocale,
    ),
  ).toBe('en');
  await expect(textLanguage).toHaveAccessibleDescription(
    'English is unavailable for this story. Showing Japanese. Your preference is kept for other stories.',
  );
  await expect(catalogLanguage).toHaveValue('en');
  await expect(catalogLanguage).toHaveAccessibleDescription(
    'English titles are unavailable for this story. Showing its original title. Event and story titles. Missing translations keep their original titles. This does not change dialogue.',
  );
  await page.screenshot({
    path: info.outputPath('ba-japanese-only-language-explanation.png'),
  });
  await catalogLanguage.selectOption('ja');
  await expect(textLanguage).toHaveValue('ja');
  await expect(page).toHaveURL(japanesePassage);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialogue).toHaveText(japanese.text.ja);
  await expect(page).toHaveURL(japanesePassage);

  const translated = chapter.nodes.find((node) => node.id === '11000:35')!;
  expect(translated.text.en).not.toBe(translated.text.ja);
  await page.goto(reader + '?line=11000%3A35');
  await expect(dialogue).toHaveText(translated.text.en);
  await page.goto(reader);
  await expect(page).toHaveURL(/line=11000%3A35/);
  await expect(dialogue).toHaveText(translated.text.en);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(textLanguage).toHaveValue('en');
  await expect(textLanguage.locator('option')).toHaveText([
    '日本語',
    'English',
  ]);
  await expect(catalogLanguage).toHaveValue('ja');
  await expect(textLanguage).toHaveAccessibleDescription(
    'Dialogue languages available for this story.',
  );
  await expect(page.locator('#text-language-note')).not.toContainText(
    'unavailable for this story',
  );
  await page.goto('/games/ba');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  await expect(textLanguage).toHaveValue('en');
  await expect(textLanguage.locator('option')).toHaveText([
    '日本語',
    'English',
  ]);
});
