import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const sceneManifest = JSON.parse(
  readFileSync('src/generated/gfl2-scenes.json', 'utf8'),
);
const program = JSON.parse(
  readFileSync(
    `public${new URL(sceneManifest.sections['gfl2-event-3478101'].url, 'http://localhost').pathname}`,
    'utf8',
  ),
);
const opening = '/read/gfl2/gfl2-event-3478101?line=A33001%3A56';
interface Diagnostics {
  loaded: string[];
  pending: string[];
  models: { id: string; patterns: string[]; alpha: number; url: string }[];
  failures: string[];
  audio: {
    context: string;
    buffers: number;
    playing: {
      cue: string;
      kind: string;
      loop: boolean;
      loopStart: number;
      loopEnd: number;
    }[];
  };
}
const diagnostics = (page: Page) =>
  page
    .getByTestId('native-layers')
    .evaluate(
      (el) =>
        (el as HTMLElement & { playbackDiagnostics: Diagnostics })
          .playbackDiagnostics,
    );
const ready = async (page: Page) => {
  await expect
    .poll(async () =>
      (await diagnostics(page)).models.some(
        (model) => model.id === '盖娅' && model.alpha === 1,
      ),
    )
    .toBe(true);
};

test('real chapter restores original character, backgrounds and BGM across seeking and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  const audioRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.ogg'))
      audioRequests.push(request.url());
  });
  await page.goto(opening);
  await ready(page);
  if ((await diagnostics(page)).audio.context !== 'running') {
    try {
      await page
        .getByRole('button', { name: 'Enable scene audio', exact: true })
        .click({ timeout: 1000 });
    } catch (error) {
      if ((await diagnostics(page)).audio.context !== 'running') throw error;
    }
  }
  await expect
    .poll(async () => (await diagnostics(page)).audio.context)
    .toBe('running');
  await expect
    .poll(
      async () =>
        (await diagnostics(page)).audio.playing.find(
          (cue) => cue.cue === '云端悲伤',
        )?.loop,
    )
    .toBe(true);
  expect(audioRequests.length).toBeLessThan(Object.keys(program.audio).length);
  const position = page.getByRole('slider', {
    name: 'Story position',
    exact: true,
  });
  await position.fill('1');
  await expect
    .poll(async () =>
      (await diagnostics(page)).loaded.includes('BG_None_Carriage_02_02'),
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await diagnostics(page)).audio.playing.find(
          (cue) => cue.cue === '黄区荒凉废墟',
        )?.loopStart,
    )
    .toBe(6.4);
  await position.fill('12');
  await ready(page);
  await position.fill('0');
  await position.fill('12');
  await ready(page);
  const url = page.url();
  await page.reload();
  await ready(page);
  expect(page.url()).toBe(url);
  expect((await diagnostics(page)).failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('download from management loads backgrounds, Live2D and original loops offline', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/manage');
  const row = page.locator('.download-item').filter({
    has: page.getByRole('link', { name: 'CS-1-1 长梦初醒', exact: true }),
  });
  await row
    .getByRole('button', { name: 'Download CS-1-1 长梦初醒', exact: true })
    .click();
  // This downloads the full scene cast and audio, not just its text. Allow
  // completion on a busy machine before checking actual offline playback.
  await expect(row).toContainText('On this device', { timeout: 60000 });
  const cache = await page.evaluate(async () =>
    (await (await caches.open('onlystory.media.v1')).keys()).map(
      (request) => new URL(request.url).pathname,
    ),
  );
  expect(cache).toContain('/vendor/live2dcubismcore.min.js');
  expect(cache).toContain(program.characters['指挥官'].female.files[0]);
  await context.setOffline(true);
  await row.getByRole('link', { name: 'CS-1-1 长梦初醒', exact: true }).click();
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('12');
  await ready(page);
  await expect
    .poll(async () =>
      (await diagnostics(page)).audio.playing.some(
        (cue) => cue.cue === '云端悲伤',
      ),
    )
    .toBe(true);
  expect((await diagnostics(page)).failures).toEqual([]);
  await page
    .getByRole('slider', { name: 'Story position', exact: true })
    .fill('1');
  await expect
    .poll(async () =>
      (await diagnostics(page)).loaded.includes('BG_None_Carriage_02_02'),
    )
    .toBe(true);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('text only layout disposes scene playback and preserves the same real passage', async ({
  page,
}) => {
  await page.goto(opening);
  await ready(page);
  const url = page.url();
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByLabel('Layout', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.reader-page')).toHaveClass(/layout-text/);
  await expect(page.getByTestId('native-layers')).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page
    .getByRole('button', { name: 'Reader settings', exact: true })
    .click();
  await page.getByLabel('Layout', { exact: true }).selectOption('scene');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await ready(page);
  expect(page.url()).toBe(url);
  expect((await diagnostics(page)).failures).toEqual([]);
});
