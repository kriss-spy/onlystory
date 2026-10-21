import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Program, SceneState } from '../src/playback/pjsk/types';
import { emptyData } from '../src/model';
import { pjskLibraryRoot } from '../scripts/local-environment.mjs';
import { readPublishedPjskEpisode } from './pjsk-installed';
import catalog from '../src/downloads/pjsk-catalog.json' with { type: 'json' };
import type { PjskRecipe } from '../src/downloads/pjsk-recipe';

const descriptor = catalog.find(
  (item) => item.episode.id === 'pjsk-cn-unit-30001',
)!;
const directRecipe: PjskRecipe = JSON.parse(
  gunzipSync(
    readFileSync('src/downloads/pjsk-recipes/' + descriptor.recipe),
  ).toString(),
);

test.use({ serviceWorkers: 'allow' });
const installed = existsSync('src/generated/pjsk-cn-unit-30001.json');
const episode = installed
  ? readPublishedPjskEpisode('src/generated/pjsk-cn-unit-30001.json')
  : null;
const program: Program | null = episode
  ? JSON.parse(
      readFileSync(pjskLibraryRoot + episode.renderer.payload.url, 'utf8'),
    )
  : null;
const route = '/read/pjsk/pjsk-cn-unit-30001';
type MusicProbe = Window & { pjskMusicStarts: AudioBufferSourceNode[] };
interface Diagnostics {
  index: number;
  lastCommand: number;
  ready: boolean;
  state: SceneState;
  models: {
    costume: string;
    visible: boolean;
    motion: string;
    expression: string;
  }[];
  music: string | null;
  audioState: string;
  playingSounds: number;
  speaker: number;
}
const diagnostics = (page: Page) =>
  page
    .getByTestId('pjsk-layers')
    .evaluate(
      (el) =>
        (el as HTMLElement & { playbackDiagnostics: Diagnostics })
          .playbackDiagnostics,
    );
async function ready(page: Page, index: number) {
  await expect
    .poll(async () => (await diagnostics(page))?.index, { timeout: 30000 })
    .toBe(index);
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  test.skip(
    !installed,
    'Run npm run import:pjsk -- --scenario mmj_01_01 --install first.',
  );
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem('onlystory.v1'))
        localStorage.setItem('onlystory.v1', JSON.stringify(data));
    },
    {
      ...emptyData(),
      preferences: {
        ...emptyData().preferences,
        textSpeed: 0,
        voice: 'ja',
        musicVolume: 0.15,
        voiceVolume: 0.5,
      },
    },
  );
});

test('full original episode executes every command and reaches completion', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [],
    missing: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/private/pjsk/'))
      missing.push(response.url());
  });
  await page.goto(route);
  await ready(page, 0);
  const audioButton = page.getByRole('button', {
    name: 'Enable scene audio',
    exact: true,
  });
  if (await audioButton.count()) await audioButton.click();
  const voiceButton = page.getByRole('button', {
    name: 'Enable audio',
    exact: true,
  });
  if (await voiceButton.count()) await voiceButton.click();
  await expect
    .poll(async () => (await diagnostics(page)).audioState)
    .toBe('running');
  expect((await diagnostics(page)).music).toBe(program!.steps[0].after.music);
  await page.screenshot({ path: testInfo.outputPath('pjsk-opening.png') });
  for (let index = 0; index < program!.steps.length; index++) {
    if (index) {
      await page
        .getByRole('button', { name: 'Next passage', exact: true })
        .click();
      await ready(page, index);
    }
    const current = await diagnostics(page);
    expect(current.state).toEqual(program!.steps[index].after);
    const expected = Object.values(current.state.characters)
      .filter((c) => c.visible)
      .map((c) => c.costume)
      .sort();
    expect(
      current.models
        .filter((m) => m.visible)
        .map((m) => m.costume)
        .sort(),
    ).toEqual(expected);
    await expect(page.locator('.dialogue-window')).toContainText(
      program!.steps[index].text,
    );
  }
  expect((await diagnostics(page)).lastCommand).toBe(175);
  expect((await diagnostics(page)).playingSounds).toBe(0);
  await expect(page.locator('.episode-end')).toContainText('本话结束');
  await page.screenshot({ path: testInfo.outputPath('pjsk-completed.png') });
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});

test('original voice decodes, models seek and bookmarks survive reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.goto(route);
  await ready(page, 0);
  const slider = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  const voicedIndex = episode.nodes.findIndex(
    (node: { voice?: string }, index: number) => index > 10 && node.voice,
  );
  await slider.fill(String(voicedIndex));
  await ready(page, voicedIndex);
  await page.keyboard.press('Shift');
  const enable = page.getByRole('button', {
    name: 'Enable audio',
    exact: true,
  });
  if (await enable.count()) await enable.click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .first()
        .evaluate(
          (el: HTMLAudioElement) =>
            Number.isFinite(el.duration) && el.duration > 0,
        ),
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Bookmark passage', exact: true })
    .click();
  const bookmarked = page.url();
  await slider.fill('40');
  await ready(page, 40);
  expect((await diagnostics(page)).state).toEqual(program!.steps[40].after);
  await page
    .getByRole('button', { name: 'Previous passage', exact: true })
    .click();
  await ready(page, 39);
  expect((await diagnostics(page)).state).toEqual(program!.steps[39].after);
  await page.reload();
  await ready(page, 39);
  await page.goto('/bookmarks');
  await page.locator('.bookmark-item a').click();
  await ready(page, voicedIndex);
  expect(page.url()).toBe(bookmarked);
  expect((await diagnostics(page)).state).toEqual(
    program!.steps[voicedIndex].after,
  );
  await page.screenshot({ path: testInfo.outputPath('pjsk-restored.png') });
});

test('episode downloads through the common manager and plays from browser cache offline', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  // The public mirror is covered separately by the opt-in static-host test.
  // Exercise manager integration deterministically with the verified originals.
  const originals = new Map([
    ...directRecipe.media.files
      .filter((file) => file.sourceUrl)
      .map((file) => [file.sourceUrl!, pjskLibraryRoot + file.url] as const),
    [
      directRecipe.scenario.sourceUrl,
      `.cache/pjsk/http/${directRecipe.scenario.sha256}.bin`,
    ] as const,
  ]);
  await context.route(
    (url) => originals.has(url.href),
    (route) =>
      route.fulfill({
        status: 200,
        body: readFileSync(originals.get(route.request().url())!),
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/octet-stream',
        },
      }),
  );
  await page.goto('/manage?game=pjsk');
  const row = page
    .locator('.download-item')
    .filter({ has: page.locator(`a[href="${route}"]`) });
  await page.getByRole('searchbox').fill(descriptor.episode.title);
  await row.getByRole('link').click();
  await ready(page, 0);
  await page.goBack();
  await page.getByRole('searchbox').fill(descriptor.episode.title);
  await row.getByRole('button', { name: /^Download / }).click();
  await expect(row).toContainText('On this device', { timeout: 60000 });
  const keys = await page.evaluate(async () =>
    (await (await caches.open('onlystory.media.v1')).keys()).map(
      (r) => new URL(r.url).pathname,
    ),
  );
  for (const asset of [
    directRecipe.text.url,
    directRecipe.program.url,
    '/vendor/live2dcubismcore.min.js',
    ...directRecipe.media.files.map((file) => file.url),
  ])
    expect(keys).toContain(asset);
  const downloadedProgram = (await page.evaluate(
    async (url) =>
      (await (await caches.open('onlystory.media.v1')).match(url))!.json(),
    directRecipe.program.url,
  )) as Program;
  await context.setOffline(true);
  await row.getByRole('link').click();
  await ready(page, 0);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('45');
  await ready(page, 45);
  expect((await diagnostics(page)).state).toEqual(
    downloadedProgram.steps[45].after,
  );
  expect((await diagnostics(page)).models.some((m) => m.visible)).toBe(true);
  await expect(page.locator('.dialogue-window')).toContainText(
    program!.steps[45].text,
  );
  await page.screenshot({ path: testInfo.outputPath('pjsk-offline.png') });
});

test('real episode is in the catalog and fits a narrow reader', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/games/pjsk?category=Main%20story&group=idol');
  await expect(
    page.getByText('MORE MORE JUMP! · 主线故事').first(),
  ).toBeVisible();
  await page.goto(route + '?line=' + encodeURIComponent(program!.steps[30].id));
  await ready(page, 30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pjsk-mobile.png') });
});

test('fast-forward cancels pending commands and restores the stopped passage', async ({
  page,
}) => {
  await page.goto(route);
  await ready(page, 0);
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).index)
    .toBeGreaterThan(6);
  await page
    .getByRole('button', { name: 'Stop fast-forward', exact: true })
    .click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const stopped = await diagnostics(page);
  expect(stopped.state).toEqual(program!.steps[stopped.index].after);
  expect(stopped.playingSounds).toBeLessThanOrEqual(1);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('61');
  await ready(page, 61);
  expect((await diagnostics(page)).lastCommand).toBe(175);
  await expect(page.locator('.episode-end')).toContainText('本话结束');
});

test('voiced inner monologue keeps lip sync off while spoken dialogue enables it', async ({
  page,
}) => {
  const mode = (step: NonNullable<typeof program>['steps'][number]) =>
    (
      step.commands.find((command) => command.action === 1)?.record as
        { LipSync?: number } | undefined
    )?.LipSync;
  const inner = program!.steps.findIndex((step) => mode(step) === 2);
  const spoken = program!.steps.findIndex((step) => mode(step) === 1);
  await page.goto(
    route + '?line=' + encodeURIComponent(program!.steps[inner].id),
  );
  await ready(page, inner);
  expect((await diagnostics(page)).speaker).toBe(0);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill(String(spoken));
  await ready(page, spoken);
  expect((await diagnostics(page)).speaker).toBeGreaterThan(0);
});

test('navigation stays warm and held Space interrupts scene waits', async ({
  page,
}) => {
  await page.goto(route);
  await ready(page, 0);
  const toggled = Date.now();
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await page
    .getByRole('button', { name: 'Stop fast-forward', exact: true })
    .click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 250 },
  );
  expect(Date.now() - toggled).toBeLessThan(500);
  await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="scene-stage"]')!;
    const flashes: number[] = [];
    Object.assign(window, { pjskLoadingFlashes: flashes });
    new MutationObserver(() => {
      if (stage.textContent?.includes('Loading scene'))
        flashes.push(performance.now());
    }).observe(stage, { childList: true, subtree: true });
    (document.activeElement as HTMLElement)?.blur();
  });
  for (let repeat = 0; repeat < 12; repeat++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(70);
  }
  await page.keyboard.up('Space');
  expect((await diagnostics(page)).index).toBeGreaterThanOrEqual(10);
  const slider = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  for (const index of [45, 23, 52, 6]) {
    const started = Date.now();
    await slider.fill(String(index));
    await expect
      .poll(async () => (await diagnostics(page)).index, {
        intervals: [10],
        timeout: 1000,
      })
      .toBe(index);
    expect(Date.now() - started).toBeLessThan(250);
    expect((await diagnostics(page)).state).toEqual(
      program!.steps[index].after,
    );
  }
  await page.getByRole('button', { name: 'Fast-forward', exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).index)
    .toBeGreaterThan(8);
  await page
    .getByRole('button', { name: 'Stop fast-forward', exact: true })
    .click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  expect(
    await page.evaluate(
      () =>
        (window as Window & { pjskLoadingFlashes: number[] })
          .pjskLoadingFlashes,
    ),
  ).toEqual([]);
});

for (const action of [
  'held Space',
  'fast-forward toggle',
  'progress dragging',
] as const) {
  test(`BGM keeps the same audio source during ${action}`, async ({ page }) => {
    await page.addInitScript(() => {
      const starts: AudioBufferSourceNode[] = [];
      (window as MusicProbe).pjskMusicStarts = starts;
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.loop) starts.push(this);
        return original.apply(this, args);
      };
    });
    await page.goto(route);
    await ready(page, 0);
    const enable = page.getByRole('button', {
      name: 'Enable scene audio',
      exact: true,
    });
    if (await enable.count()) await enable.click();
    await expect
      .poll(async () => (await diagnostics(page)).audioState)
      .toBe('running');
    expect(
      await page.evaluate(() => (window as MusicProbe).pjskMusicStarts.length),
    ).toBe(1);
    if (action === 'held Space') {
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      for (let repeat = 0; repeat < 12; repeat++) {
        await page.keyboard.down('Space');
        await page.waitForTimeout(70); // Simulate OS key-repeat while the key stays held.
      }
      await page.keyboard.up('Space');
      await expect
        .poll(async () => (await diagnostics(page)).index)
        .toBeGreaterThan(1);
    } else if (action === 'fast-forward toggle') {
      await page
        .getByRole('button', { name: 'Fast-forward', exact: true })
        .click();
      await expect
        .poll(async () => (await diagnostics(page)).index)
        .toBeGreaterThan(4);
      await page
        .getByRole('button', { name: 'Stop fast-forward', exact: true })
        .click();
    } else {
      const slider = page.getByRole('slider', {
        name: 'Story position',
        exact: true,
      });
      const box = (await slider.boundingBox())!;
      await page.mouse.move(box.x + 1, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.28, box.y + box.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      await expect
        .poll(async () => (await diagnostics(page)).index)
        .toBeGreaterThan(10);
    }
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect((await diagnostics(page)).music).toBe('bgm00018');
    expect(
      await page.evaluate(
        () =>
          new Set(
            (window as MusicProbe).pjskMusicStarts.map(
              (source) => source.context,
            ),
          ).size,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(() => (window as MusicProbe).pjskMusicStarts.length),
    ).toBe(1);
    // A real story music change must still replace the source, and silence must stop it.
    const slider = page.getByRole('slider', {
      name: 'Story position',
      exact: true,
    });
    await slider.fill('23');
    await ready(page, 23);
    expect((await diagnostics(page)).music).toBe('bgm00016');
    expect(
      await page.evaluate(() => (window as MusicProbe).pjskMusicStarts.length),
    ).toBe(2);
    await slider.fill('28');
    await ready(page, 28);
    expect((await diagnostics(page)).music).toBeNull();
  });
}
