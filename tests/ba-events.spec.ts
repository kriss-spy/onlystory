import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { emptyData, startSave, advance, type Episode } from '../src/model';

test.setTimeout(120000);
const definitions = JSON.parse(
  readFileSync('scripts/ba-library.json', 'utf8'),
).filter((d: any) => d.category === 'Event');
const collections = [
  ...new Set<string>(definitions.map((d: any) => d.collectionId)),
];
const generated = JSON.parse(
  readFileSync('src/generated/ba-stories.json', 'utf8'),
);
const generatedCollections = [
  ...new Set<string>(
    generated
      .filter((e: any) => e.category === 'Event')
      .map((e: any) => e.collectionId),
  ),
].sort();
const read = (group: number, name: string) =>
  JSON.parse(
    readFileSync(`public/private/ba-jp/${group}/${name}.json`, 'utf8'),
  );
const ready = (page: Page) =>
  expect(page.getByTestId('ba-scene')).toHaveAttribute('aria-busy', 'false', {
    timeout: 45000,
  });
function passage(group: number, accepts: (node: any, row: any) => boolean) {
  const chapter = read(group, 'chapter');
  const source = read(group, 'source');
  const episode = { ...chapter, nodes: chapter.nodes } as Episode;
  let save = startSave(episode);
  for (let i = 0; i < chapter.nodes.length * 2; i++) {
    const node = chapter.nodes.find(
      (n: any) => n.id === save.frames.at(-1)!.node,
    );
    if (accepts(node, source.content[node.source?.row])) return { node, save };
    if (node.kind === 'end') break;
    save = advance(
      episode,
      save,
      node.kind === 'choice' ? node.choices[0].id : undefined,
    );
  }
  throw new Error(`No representative passage in ${group}`);
}
const link = (group: number, target: ReturnType<typeof passage>) =>
  `/read/ba/ba-jp-${group}?line=${encodeURIComponent(target.node.id)}&choices=${encodeURIComponent(JSON.stringify(target.save.frames.at(-1)!.answers))}`;
test.beforeEach(async ({ page }) => {
  const data = emptyData();
  data.preferences.textSpeed = 0;
  data.preferences.voice = 'ja';
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    data,
  );
});

test('the normal BA catalog contains every complete selected event collection', async ({
  page,
}) => {
  expect([...collections].sort()).toEqual(generatedCollections);
  const catalog = JSON.parse(
    readFileSync('src/generated/ba-stories.json', 'utf8'),
  );
  for (const id of collections)
    expect(catalog.filter((e: any) => e.collectionId === id)).toHaveLength(
      definitions.filter((d: any) => d.collectionId === id).length,
    );
  await page.goto('/games/ba?category=Event');
  await expect(page.locator('.event-row')).toHaveCount(collections.length);
});

for (const collection of collections) {
  const first = definitions.find((d: any) => d.collectionId === collection);
  test(`${collection} renders an original scene and decodes its opening movie`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const target = passage(
      first.group,
      (n, row) => n.kind === 'text' && /^[1-5];/m.test(row?.ScriptKr ?? ''),
    );
    await page.goto(link(first.group, target));
    await ready(page);
    await expect(page.locator('.ba-canvas')).toHaveAttribute(
      'data-characters',
      /.+/,
    );
    await expect(page.locator('.dialogue-window p')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${collection}.png`) });
    const movie = passage(first.group, (n) => n.kind === 'video');
    await page.goto(link(first.group, movie));
    const player = page.locator('video');
    await expect(player).toBeVisible();
    await player.click();
    await player.evaluate((v: HTMLVideoElement) => v.play());
    await expect
      .poll(() =>
        player.evaluate(
          (v: HTMLVideoElement) =>
            v.duration > 0 && v.currentTime > 0 && v.videoWidth > 0,
        ),
      )
      .toBe(true);
    await page
      .getByRole('button', { name: 'Skip this movie', exact: true })
      .click();
    await expect(page.locator('video')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('real nested choices and command-only responses preserve their paths', async ({
  page,
}) => {
  const nested = passage(10000005, (n) => n.id === '10000005:14');
  await page.goto(link(10000005, nested));
  await ready(page);
  const outer = read(10000005, 'chapter').nodes.find(
    (n: any) => n.id === nested.node.id,
  );
  await page
    .getByRole('button', { name: outer.choices[1].label.ja, exact: true })
    .click();
  for (let i = 0; i < 5 && !page.url().includes('line=10000005%3A20'); i++) {
    await ready(page);
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/line=10000005%3A20(?:&|$)/);
  await ready(page);
  const inner = read(10000005, 'chapter').nodes.find(
    (n: any) => n.id === '10000005:20',
  );
  await page
    .getByRole('button', { name: inner.choices[0].label.ja, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`line=${encodeURIComponent(inner.choices[0].next)}(?:&|$)`),
  );
  await ready(page);
  await page.reload();
  await ready(page);
  await expect(page.locator('.dialogue-window p')).toBeVisible();
  const commandChoice = passage(10000050, (n) => n.id === '10000050:96');
  for (const choice of commandChoice.node.choices) {
    await page.goto(link(10000050, commandChoice));
    await ready(page);
    const branch = read(10000050, 'chapter').nodes.find(
      (n: any) => n.id === choice.next,
    );
    expect(branch.scene.autoAdvance).toBe(true);
    await page
      .getByRole('button', { name: choice.label.ja, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`line=${encodeURIComponent(branch.next)}(?:&|$)`),
    );
    await ready(page);
    await expect(page.locator('.dialogue-window p')).toBeVisible();
  }
});

test('event popups use original images and downloaded event movies reopen offline', async ({
  page,
}) => {
  const first = definitions[0];
  const popup = passage(
    first.group,
    (n, row) => n.kind === 'text' && !!row?.PopupFileName,
  );
  await page.goto(link(first.group, popup));
  await ready(page);
  await expect(page.locator('.ba-popup img')).toBeVisible();
  await page.goto(`/games/ba/events/${first.collectionId}`);
  await page
    .getByRole('button', { name: `Download ${first.title}`, exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')!).installed[id],
          `ba-jp-${first.group}`,
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.route('**/private/ba-jp/**', (route) => route.abort());
  await page.goto(link(first.group, popup));
  await ready(page);
  await expect(page.locator('.ba-popup img')).toBeVisible();
  const movie = passage(first.group, (n) => n.kind === 'video');
  await page.goto(link(first.group, movie));
  await expect
    .poll(() =>
      page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
});

test('untitled event continuations have readable titles and local event numbering', async ({
  page,
}) => {
  for (const group of [10000045, 10000085, 10000095, 10003055]) {
    const entry = definitions.find((d: any) => d.group === group);
    expect(entry.title).toContain('（続き）');
    expect(entry.title).not.toContain('[ruby=');
    await page.goto(`/games/ba/events/${entry.collectionId}`);
    const card = page.locator('.story-card').filter({
      has: page.getByRole('heading', { name: entry.title, exact: true }),
    });
    await expect(card).toContainText(
      `Event story · ${String(entry.order).padStart(2, '0')}`,
    );
    await expect(card.getByRole('heading')).not.toContainText(String(group));
    await expect(card.getByRole('link').first()).toHaveAttribute(
      'href',
      new RegExp(`/ba-jp-${group}(?:\\?|$)`),
    );
  }
});
