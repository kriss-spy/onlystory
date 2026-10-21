import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { gunzipSync } from 'node:zlib';
import catalog from '../src/downloads/pjsk-catalog.json' with { type: 'json' };

const entry = catalog.find(
  (c) => c.episode.id === (process.env.PJSK_CHAPTER || 'pjsk-cn-unit-30001'),
);
if (!entry) throw Error('Unknown PJSK_CHAPTER');
const recipe = {
  ...JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join('src/downloads/pjsk-recipes', entry.recipe)),
    ).toString(),
  ),
  episode: entry.episode,
};

const output = path.resolve(
  process.env.ONLYSTORY_VERIFICATION_ROOT ?? '.cache',
  'desktop-pjsk-verification',
  entry.episode.id,
);
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, `live-${Date.now()}`);
const executablePath = process.env.ONLYSTORY_EXE;
async function launch() {
  // Exercise ordinary application startup. The Electron inspector can pause an
  // existing-profile service worker during relaunch, before a window is exposed.
  const debug = path.join(profile, 'DevToolsActivePort');
  fs.rmSync(debug, { force: true });
  const child = spawn(
    executablePath || electronPath,
    [
      ...(executablePath ? [] : ['desktop']),
      '--remote-debugging-port=0',
      `--onlystory-profile=${profile}`,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stderr.on('data', (data) => {
    log += data.toString();
  });
  const deadline = Date.now() + 60000;
  while (!fs.existsSync(debug)) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw Error('Application did not start: ' + log);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const port = fs.readFileSync(debug, 'utf8').split(/\r?\n/)[0];
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  return {
    firstWindow: async () =>
      browser.contexts()[0].pages()[0] ??
      (await browser.contexts()[0].waitForEvent('page')),
    close: async () => {
      for (const page of browser.contexts()[0].pages())
        await page.evaluate(() => window.close()).catch(() => {});
      await browser.close().catch(() => {});
      if (child.exitCode === null)
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      if (child.exitCode === null) {
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      }
    },
  };
}
let app;
const errors = [];
async function pageOf(application) {
  const page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForURL('**/library');
  await page.waitForLoadState('domcontentloaded');
  return page;
}
const diagnostics = (page) =>
  page
    .getByTestId('pjsk-layers')
    .evaluate((element) => element.playbackDiagnostics);
try {
  app = await launch();
  let page = await pageOf(app);
  const origin = new URL(page.url()).origin;
  await page.goto(origin + '/downloads/' + recipe.episode.id);
  await page
    .getByRole('button', { name: 'Download and import', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.getByRole('alert').count())
          ? await page.getByRole('alert').innerText()
          : (await page
                .getByRole('link', { name: 'Read story', exact: true })
                .isVisible())
            ? 'ready'
            : 'working',
      { timeout: 240000 },
    )
    .not.toBe('working');
  if (await page.getByRole('alert').count()) {
    await page.screenshot({ path: path.join(output, 'download-failure.png') });
    throw Error(await page.getByRole('alert').innerText());
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('link', { name: 'Read story', exact: true }).click();
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  expect((await diagnostics(page)).models.length).toBe(
    Object.keys(recipe.media.models).length,
  );
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1'));
    data.preferences.textSpeed = 0;
    data.preferences.waitVoice = false;
    localStorage.setItem('onlystory.v1', JSON.stringify(data));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'onlystory.v1',
        newValue: JSON.stringify(data),
      }),
    );
  });
  await page.screenshot({
    path: path.join(output, 'live2d-online.png'),
    scale: 'css',
  });
  await app.close();
  app = undefined;
  app = await launch();
  page = await pageOf(app);
  await page.context().setOffline(true);
  await page.goto(origin + '/read/pjsk/' + recipe.episode.id);
  await expect(page.getByTestId('scene-stage')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  const voices = await page.evaluate(
    async (urls) => {
      const cache = await caches.open('onlystory.media.v1'),
        decoder = new AudioContext();
      try {
        for (const url of urls) {
          const response = await cache.match(url);
          const decoded = await decoder.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (decoded.duration <= 0) throw Error('Empty voice');
        }
        return urls.length;
      } finally {
        await decoder.close();
      }
    },
    [...new Set(Object.values(recipe.media.voices))],
  );
  for (let index = 1; index < recipe.episode.content.count; index++) {
    const choice = page.locator('.story-choices button').first();
    const skip = page.getByRole('button', {
      name: /^(Skip this movie|Continue story)$/,
    });
    if (await choice.isVisible()) await choice.click();
    else if (await skip.isVisible()) await skip.click();
    else
      await page
        .getByRole('button', { name: 'Next passage', exact: true })
        .click();
    await expect
      .poll(async () => (await diagnostics(page))?.index, { timeout: 30000 })
      .toBe(index);
    await expect(page.getByTestId('scene-stage')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await expect(page.locator('.episode-end')).toContainText('本话结束');
  const inventory = await page.evaluate((id) => {
    const data = JSON.parse(localStorage.getItem('onlystory.v1'));
    return {
      installed: data.installed[id],
      files: data.installations[id].files,
    };
  }, entry.episode.id);
  expect(inventory.installed).toBe(true);
  expect(inventory.files).toEqual([
    `/private/pjsk/installations/${entry.episode.id}.json`,
  ]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: path.join(output, 'offline-complete.png'),
    scale: 'css',
  });
  const result = {
    checkedAt: new Date().toISOString(),
    executable: executablePath ?? 'Electron development runtime',
    chapter: entry.episode.id,
    passages: recipe.episode.content.count,
    voices,
    models: Object.keys(recipe.media.models).length,
    offlineRestartCompleted: true,
    compactInventory: true,
    errors,
  };
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(result, null, 2),
  );
  console.log('PASS: PJSK desktop Live2D and offline chapter', result);
} finally {
  await app?.close();
}
