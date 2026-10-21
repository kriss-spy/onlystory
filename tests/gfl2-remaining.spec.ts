import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { plainText } from '../src/playback/gfl2/text';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const packages = read('src/generated/gfl2-packages.json');
const readUrl = (url: string) =>
  read('public' + new URL(url, 'http://localhost').pathname);
const branching = packages.find(
  (p: any) => p.event.id === 'gfl2-cn-4045',
).event;

test('real investigation choices loop, resume, and share the full path', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem(
        'onlystory.v1',
        JSON.stringify({
          version: 1,
          preferences: { textSpeed: 0, reducedMotion: true },
        }),
      );
  });
  const section = branching.sections.find((s: any) =>
    s.scripts.includes('A29008'),
  );
  const reader = readUrl(section.contentUrl),
    choice = reader.passages.find((p: any) => p.kind === 'choice');
  await page.goto(
    `/read/gfl2/${section.id}?line=${encodeURIComponent(choice.id)}`,
  );
  await expect(
    page.getByRole('button', { name: '雅妮娜不存在', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '雅妮娜不存在', exact: true }).click();
  let id = choice.choices[0].next;
  while (id !== choice.id) {
    const node = reader.passages.find((p: any) => p.id === id);
    await expect(page).toHaveURL(new RegExp(`line=${encodeURIComponent(id)}`));
    await expect(page.locator('.dialogue-window p')).toHaveText(
      plainText(node.text).replaceAll('{}', '指挥官'),
    );
    await page
      .getByRole('button', { name: 'Next passage', exact: true })
      .click();
    id = node.next;
  }
  await expect(
    page.getByRole('button', { name: '大部分都是事实', exact: true }),
  ).toBeVisible();
  const frames = () =>
    page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('onlystory.v1')!).saves[id].frames,
      section.id,
    );
  const original = await frames();
  expect(original.filter((f: any) => f.node === choice.id)).toHaveLength(2);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '大部分都是事实', exact: true }),
  ).toBeVisible();
  expect(await frames()).toEqual(original);
  await page
    .getByRole('button', { name: '大部分都是事实', exact: true })
    .click();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.locator('.dialogue-window p')).toHaveText(
    await page.locator('.dialogue-window p').innerText(),
  );
  await second.close();
});

test('out-of-line alternative dialogue after EndScenario remains reachable', async ({
  page,
}) => {
  const section = branching.sections.find((s: any) =>
    s.scripts.includes('A29014'),
  );
  const reader = readUrl(section.contentUrl),
    choice = reader.passages.find((p: any) => p.kind === 'choice');
  await page.goto(
    `/read/gfl2/${section.id}?line=${encodeURIComponent(choice.id)}`,
  );
  await page.getByRole('button', { name: '从窗户出入', exact: true }).click();
  const destination = reader.passages.find(
    (p: any) => p.id === choice.choices[1].next,
  );
  await expect(page.locator('.dialogue-window p')).toHaveText(
    plainText(destination.text).replaceAll('{}', '指挥官'),
  );
  await expect(page.locator('.episode-end')).toHaveCount(0);
});

for (const label of ['11801', '11901', '12001'])
  test(`movie ${label} loads the female Japanese source variant and subtitles`, async ({
    page,
  }) => {
    let selected: any;
    for (const p of packages)
      for (const section of p.event.sections) {
        const reader = readUrl(section.contentUrl),
          node = reader.passages.find((n: any) => n.video === label);
        if (node)
          selected = {
            section,
            node,
            program: readUrl(p.scenes.sections[section.id].url),
          };
      }
    expect(selected).toBeTruthy();
    await page.addInitScript(() =>
      localStorage.setItem(
        'onlystory.v1',
        JSON.stringify({
          version: 1,
          preferences: { textVariant: 'female', voice: 'ja' },
        }),
      ),
    );
    const requested = new Set<string>();
    page.on('request', (request) =>
      requested.add(new URL(request.url()).pathname),
    );
    await page.goto(
      `/read/gfl2/${selected.section.id}?line=${encodeURIComponent(selected.node.id)}`,
    );
    const video = page.getByLabel('Story movie', { exact: true }),
      expected = selected.program.videos[label].female;
    await expect(video).toHaveAttribute('src', /^blob:/);
    await expect(video).toHaveAttribute('data-movie-mode', 'shared-streams');
    await expect(video).toHaveAttribute('data-movie-voice', 'ja');
    await expect
      .poll(
        () =>
          requested.has(expected.streams.video.init.url) &&
          requested.has(expected.streams.audio.ja.init.url),
      )
      .toBe(true);
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect(video.locator('track')).toHaveAttribute(
      'src',
      expected.subtitles[0].url,
    );
  });

test('Silent Synapse exposes only the three released chapters and labels the pending finale', async ({
  page,
}) => {
  await page.goto('/games/gfl2/events/gfl2-cn-4052');
  await expect(page.getByRole('note')).toContainText('2026-10-20');
  await expect(page.locator('.chapter-toggle')).toHaveCount(3);
  const event = packages.find((p: any) => p.event.id === 'gfl2-cn-4052').event;
  expect(event.sections.some((s: any) => s.chapter.id === '4054')).toBe(false);
});
