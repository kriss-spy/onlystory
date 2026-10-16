import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { plainText } from '../src/playback/gfl2/text';

const manifest = existsSync('src/generated/gfl2-event.json')
  ? JSON.parse(readFileSync('src/generated/gfl2-event.json', 'utf8'))
  : null;
interface Section {
  id: string;
  title: string;
  contentUrl: string;
  sourceUrl: string;
  firstNode: string;
  lastNode: string;
  textRows: number;
}
const sections: Section[] = manifest?.sections ?? [];
const chapter = (section: Section) =>
  JSON.parse(
    readFileSync(
      `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
      'utf8',
    ),
  );
const route = (section: Section, line = section.firstNode) =>
  `/read/gfl2/${section.id}?line=${encodeURIComponent(line)}`;
async function instant(page: Page) {
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}
test.beforeEach(() => {
  test.skip(!manifest, 'Import the original GFL2 event first.');
});

test('normal library opens the complete first section and lazily fetches only that text', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/gfl2-event/readers/'))
      requests.push(request.url());
  });
  await page.goto('/library');
  await expect(page.getByText(/4,443 段原文/)).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('link', { name: /GIRLS.*金翅雀与橄榄枝/ }).click();
  await expect(page.locator('.story-card')).toHaveCount(24);
  expect(requests).toHaveLength(0);
  await page
    .getByRole('link', { name: /Main story · 01 CS-1-1 长梦初醒/ })
    .click();
  await expect(page.locator('.reader-page')).toHaveClass(/layout-scene/);
  await expect(page.locator('.dialogue-window')).toContainText('2074年X月X日');
  expect(requests).toHaveLength(1);
  await instant(page);
  await page.goto(route(sections[0], 'A33001:43'));
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(page).toHaveURL(/line=A33001%3A56/);
  await expect(page.locator('.speaker-row')).toContainText('盖娅');
  await page
    .getByRole('button', { name: 'Story information', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('187');
  await expect(page.getByRole('dialog')).toContainText('Live2D models');
  await expect(
    page.getByRole('link', { name: 'Download original script data' }),
  ).toHaveAttribute('href', sections[0].sourceUrl);
});

test('all 24 sections open at their original first and last passages', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const section of sections) {
    const data = chapter(section);
    await page.goto(route(section));
    await expect(page.locator('.reader-header strong')).toHaveText(
      section.title,
    );
    await expect(page.locator('.dialogue-window p')).toHaveText(
      plainText(data.passages[0].text).replaceAll('{}', '指挥官'),
    );
    await page.goto(route(section, section.lastNode));
    await expect(page.locator('.dialogue-window p')).toHaveText(
      plainText(data.passages.at(-1).text).replaceAll('{}', '指挥官'),
    );
    await expect(
      page.getByRole('slider', { name: 'Story position' }),
    ).toHaveAttribute(
      'aria-valuetext',
      `Passage ${section.textRows} of ${section.textRows}`,
    );
    await expect(page.locator('.episode-end')).toBeVisible();
  }
  await expect(page.locator('.episode-end')).toContainText('全文阅读完毕');
  expect(errors).toEqual([]);
});

test('cross-section navigation, back, bookmark, checkpoint and reload preserve full text progress', async ({
  page,
  context,
}) => {
  await page.goto(route(sections[0], sections[0].lastNode));
  await page.getByRole('button', { name: 'Next section', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(sections[1].id));
  await instant(page);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await page
    .getByRole('button', { name: 'Bookmark passage', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save points', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save current point', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const url = page.url();
  const text = await page.locator('.dialogue-window p').textContent();
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await page.getByRole('button', { name: 'Save points', exact: true }).click();
  await page
    .getByRole('button', { name: 'Restore checkpoint', exact: true })
    .click();
  await expect(page).toHaveURL(url);
  await page.reload();
  await expect(page.locator('.dialogue-window p')).toHaveText(text!);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('.dialogue-window p')).toHaveText(text!);
  await other.close();
  await page.goto('/bookmarks');
  await page.locator('.bookmark-item a').click();
  await expect(page).toHaveURL(url);
  await page.goBack();
  await expect(page).toHaveURL(/bookmarks/);
});

test('original gender variants and player-name placeholders are selectable and persist', async ({
  page,
}) => {
  const first = chapter(sections[0]);
  const variant = first.passages.find(
    (p: { text: string; textFemale: string }) => p.text !== p.textFemale,
  );
  await page.goto(route(sections[0], variant.id));
  await instant(page);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByLabel('Protagonist version', { exact: true })
    .selectOption('female');
  await page.getByLabel('Player name', { exact: true }).fill('测试指挥官');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.dialogue-window p')).toHaveText(
    plainText(variant.textFemale).replaceAll('{}', '测试指挥官'),
  );
  const section = sections.find((s) =>
    chapter(s).passages.some((p: { speaker: string }) => p.speaker === '{}'),
  )!;
  const passage = chapter(section).passages.find(
    (p: { speaker: string }) => p.speaker === '{}',
  );
  await page.goto(route(section, passage.id));
  await expect(page.locator('.speaker-row')).toContainText('测试指挥官');
  await page.reload();
  await expect(page.locator('.speaker-row')).toContainText('测试指挥官');
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await expect(
    page.getByLabel('Protagonist version', { exact: true }),
  ).toHaveValue('female');
});

test('downloaded text loads offline and a failed chapter request can be retried', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.route('**/gfl2-event/readers/**', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto(route(sections[0]));
  await expect(
    page.getByRole('heading', { name: 'Chapter unavailable' }),
  ).toBeVisible();
  await page.unroute('**/gfl2-event/readers/**');
  await page.getByRole('button', { name: 'Retry chapter' }).click();
  await expect(page.locator('.dialogue-window')).toContainText('2074年');
  await page.goto('/manage');
  const row = page
    .locator('.download-item')
    .filter({
      has: page.getByRole('link', { name: 'CS-1-6 祈盼明天', exact: true }),
    });
  await row
    .getByRole('button', { name: 'Download CS-1-6 祈盼明天', exact: true })
    .click();
  await expect(row).toContainText('On this device', { timeout: 30000 });
  await context.setOffline(true);
  await row.getByRole('link', { name: 'CS-1-6 祈盼明天', exact: true }).click();
  await expect(page.locator('.reader-header strong')).toHaveText(
    'CS-1-6 祈盼明天',
  );
  await expect(page.locator('.dialogue-window p')).toHaveText(
    plainText(chapter(sections.at(-1)!).passages[0].text),
  );
  await context.setOffline(false);
});

test('long original text remains scrollable with controls visible at 320x700', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  let longest = {
    section: sections[0],
    passage: chapter(sections[0]).passages[0],
  };
  for (const section of sections)
    for (const passage of chapter(section).passages)
      if (passage.text.length > longest.passage.text.length)
        longest = { section, passage };
  await page.goto(route(longest.section, longest.passage.id));
  await instant(page);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByLabel('Layout', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.reader-page')).toHaveClass(/layout-text/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Story information', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeVisible();
  await page.locator('.scene-reader').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({
    path: testInfo.outputPath('full-event-long-text.png'),
  });
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  expect(
    await page.locator('.scene-reader').evaluate((el) => el.scrollTop),
  ).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('full-event-mobile.png') });
});
