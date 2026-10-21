import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryRoot } from '../scripts/local-environment.mjs';
import { emptyData } from '../src/model';

const available = existsSync('src/generated/gfl1-catalog.json');
test('Sunshine alias plays and Gunfight plays once, carries through advance, and cancels on seek or skip', async ({
  page,
}) => {
  test.skip(!available, 'Import GFL1 audio first.');
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: { ...emptyData().preferences, textSpeed: 0 },
    },
  );
  await page.goto('/read/gfl1/gfl1-1-1-2?line=1-1-2%3A9');
  const music = page.locator('audio[loop]');
  await expect(music).toHaveAttribute('src', /BGM_Sunshine/);
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  const enable = page.getByRole('button', {
    name: 'Enable audio',
    exact: true,
  });
  if (await enable.isVisible()) await enable.click();
  await expect
    .poll(() =>
      music.evaluate(
        (el) =>
          !(el as HTMLAudioElement).paused &&
          (el as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  await page.goto('/read/gfl1/gfl1-1-5-2');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  const effect = page.getByTestId('gfl1-sfx-SE1');
  await position.fill('2');
  await expect(effect).toHaveAttribute('data-cue', 'Gunfight');
  await expect
    .poll(() =>
      effect.evaluate(
        (el) =>
          !(el as HTMLAudioElement).paused &&
          (el as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
  const time = await effect.evaluate(
    (el) => (el as HTMLAudioElement).currentTime,
  );
  await page.getByRole('button', { name: 'Next passage', exact: true }).click();
  await expect(effect).toHaveAttribute('data-cue', 'Gunfight');
  await expect
    .poll(() => effect.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeGreaterThan(time);
  await expect(effect).not.toHaveAttribute('src', { timeout: 7000 });
  await position.fill('2');
  await expect(effect).toHaveAttribute('src', /Gunfight/);
  await position.fill('0');
  await expect(effect).not.toHaveAttribute('src');
  await position.fill('2');
  await expect(effect).toHaveAttribute('src', /Gunfight/);
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect(effect).not.toHaveAttribute('src');
});

test('downloaded sound effect decodes without a media server and respects the sound volume', async ({
  page,
}) => {
  await page.addInitScript(
    (data) => localStorage.setItem('onlystory.v1', JSON.stringify(data)),
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        soundVolume: 0.25,
        textSpeed: 0,
      },
    },
  );
  await page.goto('/manage');
  await page
    .getByRole('combobox', { name: 'Download game' })
    .selectOption('gfl1');
  await page.getByRole('searchbox', { name: 'Search downloads' }).fill('1-5');
  const row = page
    .locator('.download-item')
    .filter({ hasText: 'GFL1' })
    .filter({
      has: page.getByRole('link', { name: '1-5 · Ending', exact: true }),
    });
  await row
    .getByRole('button', { name: 'Download 1-5 · Ending', exact: true })
    .click();
  await expect(row).toContainText('On this device', { timeout: 30000 });
  await page.route('**/private/gfl1/**', (route) => route.abort());
  // In-app navigation preserves the downloaded installation in this session.
  await row.getByRole('link', { name: '1-5 · Ending', exact: true }).click();
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('2');
  const effect = page.getByTestId('gfl1-sfx-SE1');
  await expect(effect).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => effect.evaluate((el) => (el as HTMLAudioElement).volume))
    .toBe(0.25);
  await expect
    .poll(() =>
      effect.evaluate(
        (el) =>
          !(el as HTMLAudioElement).paused &&
          (el as HTMLAudioElement).currentTime > 0,
      ),
    )
    .toBe(true);
});
test('communication uses a cropped full-color transmission window and restores after seeking', async ({
  page,
}) => {
  test.skip(!available, 'Import the Steam EN GFL1 Chapter 1 first.');
  await page.goto('/read/gfl1/gfl1-1-1-1?line=1-1-1%3A9');
  const transmission = page.getByRole('img', {
    name: 'Transmission from NPC-Kalin',
  });
  await expect(transmission).toBeVisible();
  const portrait = transmission.locator('img');
  await expect(portrait).toHaveCSS('filter', 'none');
  await expect(transmission).toHaveCSS('overflow', 'hidden');
  await expect(transmission.locator('.gfl1-transmission-border')).not.toHaveCSS(
    'border-image-source',
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(transmission.locator('.gfl1-transmission-scan')).toHaveCSS(
    'animation-name',
    'none',
  );
  const bounds = (await transmission.boundingBox())!;
  expect(bounds.height / bounds.width).toBeGreaterThan(1.35);
  expect(bounds.height / bounds.width).toBeLessThan(1.65);
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('7');
  await expect(transmission).toHaveCount(0);
  await position.fill('8');
  await expect(transmission).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = (await transmission.boundingBox())!;
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(390);
});
test.beforeEach(() => {
  test.skip(!available, 'Import the Steam EN GFL1 Chapter 1 first.');
});

test('GFL1 catalog opens original scenes, seeks expressions, saves and restores progress', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/games/gfl1');
  await page.getByRole('link', { name: /Chapter 1 ·/ }).click();
  await expect(
    page.getByRole('heading', { name: /Chapter 1 ·/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: /1-1 · Opening/ }).click();
  const stage = page.getByTestId('gfl1-stage');
  await expect(stage).toBeVisible();
  await expect(page.locator('.dialogue-window')).toContainText(
    'Griffin jurisdiction',
  );
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('1');
  await expect(page.locator('.speaker-row')).toContainText('Lively Young Girl');
  await expect(
    stage.getByRole('img', { name: 'NPC-Kalin, expression 1' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      stage
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await position.fill('2');
  await expect(
    stage.getByRole('img', { name: 'NPC-Kalin, expression 0' }),
  ).toBeVisible();
  await position.fill('1');
  await expect(
    stage.getByRole('img', { name: 'NPC-Kalin, expression 1' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    stage.getByRole('img', { name: 'NPC-Kalin, expression 1' }),
  ).toBeVisible();
  await expect(position).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('all twelve packages have original files and reach the final source line before the end card', async ({
  request,
  page,
}) => {
  const catalog = JSON.parse(
    readFileSync('src/generated/gfl1-catalog.json', 'utf8'),
  ).filter(
    (episode: { collectionId: string; id: string }) =>
      episode.collectionId === 'gfl1-chapter-1-normal' &&
      /^gfl1-1-\d+-[12]$/.test(episode.id),
  );
  expect(catalog).toHaveLength(12);
  for (const episode of catalog) {
    const response = await request.get(episode.content.url);
    expect(response.ok()).toBe(true);
    const chapter = await response.json();
    expect(chapter.nodes).toHaveLength(episode.content.count);
    expect(chapter.nodes.at(-1).kind).toBe('end');
    expect(chapter.nodes.at(-2).kind).toBe('text');
    expect(
      chapter.audit.filter(
        (entry: { kind: string }) =>
          entry.kind.startsWith('missing-portrait') ||
          entry.kind.startsWith('missing-background'),
      ),
    ).toEqual([]);
    for (const asset of episode.assets)
      expect(existsSync(resolve(libraryRoot, '.' + asset))).toBe(true);
  }
  await page.goto('/read/gfl1/gfl1-1-6-2');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('18');
  await expect(page.locator('.dialogue-window')).toContainText('disappoint');
  await expect(page.locator('.episode-end')).toHaveCount(0);
  await position.fill('19');
  await expect(page.locator('.episode-end')).toBeVisible();
});

test('available original BGM changes on seek and stops at the end', async ({
  page,
}) => {
  await page.goto('/read/gfl1/gfl1-1-6-2');
  const music = page.locator('audio[loop]');
  await expect(music).toHaveAttribute('src', /BGM_Sneak/);
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('11');
  await expect(music).toHaveAttribute('src', /BGM_Boss/);
  await position.fill('0');
  await expect(music).toHaveAttribute('src', /BGM_Sneak/);
  await position.fill('19');
  await expect(music).not.toHaveAttribute('src');
});

test('downloaded English scenes play with the private media server unavailable', async ({
  page,
}) => {
  await page.goto('/manage');
  await page.getByRole('searchbox', { name: 'Search downloads' }).fill('1-6');
  const row = page
    .locator('.download-item')
    .filter({ hasText: 'GFL1' })
    .filter({
      has: page.getByRole('link', { name: '1-6 · Ending', exact: true }),
    });
  await row
    .getByRole('button', { name: 'Download 1-6 · Ending', exact: true })
    .click();
  await expect(row).toContainText('On this device', { timeout: 30000 });
  await expect(row).toContainText('English text');
  await page.route('**/private/gfl1/**', (route) => route.abort());
  await page.goto('/read/gfl1/gfl1-1-6-2');
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('6');
  await expect(
    page
      .getByTestId('gfl1-stage')
      .getByRole('img', { name: 'VZ61, expression 0' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId('gfl1-stage')
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(page.locator('audio[loop]')).toHaveAttribute('src', /^blob:/);
});
