import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { plainText } from '../src/playback/gfl2/text';

const packages = JSON.parse(
  readFileSync('src/generated/gfl2-packages.json', 'utf8'),
);

for (const { event } of packages) {
  test(`${event.id} opens original dialogue and its final boundary`, async ({
    page,
  }) => {
    await page.goto(`/games/gfl2/events/${event.id}`);
    await expect(
      page.getByRole('heading', { name: event.title, exact: true }),
    ).toBeVisible();
    const section = event.sections[0];
    const reader = JSON.parse(
      readFileSync(
        `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
        'utf8',
      ),
    );
    const first = reader.passages.find((p: { kind?: string }) => !p.kind);
    await page.goto(
      `/read/gfl2/${section.id}?line=${encodeURIComponent(first.id)}`,
    );
    await expect(page.locator('.dialogue-window')).toContainText(
      plainText(first.text).replace(/\{\}/g, '指挥官'),
    );
    await page.goto(
      `/read/gfl2/${section.id}?line=${encodeURIComponent(section.lastNode)}`,
    );
    await expect(page.locator('.episode-end')).toBeVisible();
  });
}

test('Glass Island keeps both chapters and plays its recovered movie', async ({
  page,
}) => {
  const { event } = packages.find(
    ({ event }: { event: { id: string } }) => event.id === 'gfl2-glass-island',
  );
  await page.goto(`/games/gfl2/events/${event.id}`);
  await expect(page.locator('.chapter-toggle')).toHaveCount(2);
  await page.getByRole('button', { name: /下篇/ }).click();
  await expect(page.getByRole('button', { name: /下篇/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const section = event.sections.find((s: { scripts: string[] }) =>
    s.scripts.includes('AA03001'),
  );
  const reader = JSON.parse(
    readFileSync(
      `public${new URL(section.contentUrl, 'http://localhost').pathname}`,
      'utf8',
    ),
  );
  const movie = reader.passages.find(
    (p: { kind?: string }) => p.kind === 'video',
  );
  await page.goto(
    `/read/gfl2/${section.id}?line=${encodeURIComponent(movie.id)}`,
  );
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  await expect(video).toHaveAttribute('data-movie-mode', 'shared-streams');
  await expect(video).toHaveAttribute('src', /^blob:/);
  const ending = event.sections.find(
    (s: { lastNode: string }) => s.lastNode === 'AA03002:end',
  );
  await page.goto(
    `/read/gfl2/${ending.id}?line=${encodeURIComponent(ending.lastNode)}`,
  );
  await expect(page.locator('.episode-end')).toBeVisible();
});
