import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData } from '../src/model';

const opening = '/read/gfl2/gfl2-event-3478101?line=A33001%3A6';
const manifest = JSON.parse(
  readFileSync('src/generated/gfl2-event.json', 'utf8'),
);
const section = manifest.sections[0];
const chapter = JSON.parse(
  readFileSync(
    `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
    'utf8',
  ),
);
const position = (page: import('@playwright/test').Page) =>
  page.getByRole('slider', { name: 'Story position', exact: true });

test('fast-forward keeps advancing unread text until toggled off', async ({
  page,
}) => {
  // Existing installations used this setting; the new behavior must work there too.
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem('onlystory.v1'))
        localStorage.setItem('onlystory.v1', JSON.stringify(data));
    },
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, skipMode: 'read' },
    },
  );
  await page.goto(opening, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Characters per second', exact: true })
    .fill('1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal text', exact: true }).click();
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.locator('.passage-position').textContent()),
    )
    .toBeGreaterThan(5);
  await page
    .getByRole('button', { name: 'Stop fast-forward', exact: true })
    .click();
  const stopped = page.url();
  await page.waitForTimeout(350);
  expect(page.url()).toBe(stopped);
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeVisible();
});

test('clicking the progress bar seeks to another passage', async ({ page }) => {
  await page.goto(opening, { waitUntil: 'domcontentloaded' });
  const progress = page.locator('.reader-progress');
  const box = (await progress.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(page).not.toHaveURL(/line=A33001%3A6$/);
  await expect
    .poll(async () => Number(await position(page).inputValue()))
    .toBeGreaterThan(130);
});

test('dragging seeks in both directions, updates text and URLs, and survives reload', async ({
  page,
}, testInfo) => {
  await page.goto(opening, { waitUntil: 'domcontentloaded' });
  const bar = position(page);
  const box = (await bar.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.88, y, { steps: 8 });
  await expect
    .poll(async () => Number(await bar.inputValue()))
    .toBeGreaterThan(150);
  await page.mouse.move(box.x + box.width * 0.15, y, { steps: 8 });
  await page.mouse.up();
  const index = Number(await bar.inputValue());
  expect(index).toBeGreaterThan(20);
  expect(index).toBeLessThan(35);
  expect(new URL(page.url()).searchParams.get('line')).toBe(
    chapter.passages[index].id,
  );
  await expect(page.locator('.dialogue-window p')).toContainText(
    chapter.passages[index].text
      .replace(/<[^>]*>/g, '')
      .replaceAll('{}', '指挥官'),
  );
  const url = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(bar).toHaveValue(String(index));
  expect(page.url()).toBe(url);
  await bar.focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(
    new RegExp(encodeURIComponent(section.lastNode)),
  );
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/line=A33001%3A6$/);
  await page.screenshot({ path: testInfo.outputPath('seek-desktop.png') });
});

test('fast-forward carries into the next section and seeking stops playback', async ({
  page,
}) => {
  await page.goto(
    `/read/gfl2/${section.id}?line=${encodeURIComponent(chapter.passages.at(-3).id)}`,
  );
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(manifest.sections[1].id));
  await expect(
    page.getByRole('button', { name: 'Stop fast-forward', exact: true }),
  ).toBeVisible();
  await position(page).fill('30');
  await expect(position(page)).toHaveValue('30');
  const url = page.url();
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('seeking respects unanswered choices and retains an answered branch during a drag', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=arrival', {
    waitUntil: 'domcontentloaded',
  });
  await position(page).focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/line=decision$/);
  await page
    .getByRole('button', { name: 'Follow the signal', exact: true })
    .click();
  const bar = position(page);
  const box = (await bar.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 6, y, { steps: 5 });
  await expect(page).toHaveURL(/line=arrival$/);
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.up();
  await expect(page).toHaveURL(/line=follow&choices=.*follow/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.dialogue-window')).toContainText(
    'Take the light',
  );
  await page.goto(
    '/read/gfl1/gfl1-3?line=arrival&choices=%7B%22decision%22%3A%22listen%22%7D',
    { waitUntil: 'domcontentloaded' },
  );
  // Before the choice, URL restoration discards future answers. Answer it explicitly.
  await position(page).focus();
  await page.keyboard.press('End');
  await page
    .getByRole('button', { name: 'Stay and listen', exact: true })
    .click();
  await position(page).focus();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/line=gap/);
  await expect(
    page.getByRole('button', { name: 'Next passage', exact: true }),
  ).toBeDisabled();
});

test('fast-forward stops at an unanswered choice and at the end of the story', async ({
  page,
}) => {
  await page.goto('/read/ba/ba-1?line=arrival', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page).toHaveURL(/line=decision$/);
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toBeDisabled();
  const last = manifest.sections.at(-1);
  const data = JSON.parse(
    readFileSync(
      `public${new URL(last.contentUrl, 'http://localhost').pathname}`,
      'utf8',
    ),
  );
  await page.goto(
    `/read/gfl2/${last.id}?line=${encodeURIComponent(data.passages.at(-2).id)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(page.locator('.episode-end')).toContainText('全文阅读完毕');
  await expect(
    page.getByRole('button', { name: 'Fast-forward', exact: true }),
  ).toBeDisabled();
});

test.describe('touch progress seeking', () => {
  test.use({ hasTouch: true, viewport: { width: 487, height: 661 } });
  test('touch drag moves through real GFL2 text', async ({
    page,
    context,
  }, testInfo) => {
    await page.goto(opening, { waitUntil: 'domcontentloaded' });
    const bar = position(page);
    const box = (await bar.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.2, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * 0.8, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(async () => Number(await bar.inputValue()))
      .toBeGreaterThan(130);
    await expect(bar).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('seek-touch.png') });
    await cdp.detach();
  });
});
