// Verify the shipped native downloader and original-file importer. No private
// library server or prepared chapter/media files are available to this app.
// By default, reuse verified ORIGINAL source packs and leave one small original
// uncached to prove live HTTPS downloading. --live downloads every original.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { _electron, chromium, expect } from '@playwright/test';
import electronPath from 'electron';

const root = process.cwd();
// Packaged checks may run alongside browser-test builds in dist/. Keep their
// expected production shell tied to the explicit build used for packaging.
const webRoot = path.resolve(process.env.ONLYSTORY_WEB_ROOT ?? 'dist');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const catalog = read('src/downloads/ba/catalog.json');
const sources = read('src/downloads/ba/sources.json');
const episodes = read('src/generated/ba-stories.json');
const groupsArgument = process.argv.find((value) =>
  value.startsWith('--groups='),
);
const movie = episodes
  .filter((episode) => episode.assets.some((url) => url.endsWith('.mp4')))
  .sort((a, b) => a.assets.length - b.assets.length)[0];
const groups = groupsArgument
  ? groupsArgument.slice('--groups='.length).split(',').map(Number)
  : [11010, 2401, 10000010, Number(movie?.id.split('-').at(-1))];
if (groups.some((group) => !Number.isSafeInteger(group)))
  throw Error(
    'Expected numeric chapter groups and at least one movie chapter.',
  );
const recipes = [...new Set(groups)].map((group) => {
  const entry = catalog.find((item) => item.group === group);
  if (!entry) throw Error(`No published download recipe for group ${group}.`);
  const compressed = fs.readFileSync(
    path.join('src/downloads/ba/recipes', entry.recipe),
  );
  if (compressed.length !== entry.bytes || digest(compressed) !== entry.sha256)
    throw Error(`Invalid published recipe ${entry.recipe}.`);
  return JSON.parse(gunzipSync(compressed).toString());
});
const executablePath = process.env.ONLYSTORY_EXE
  ? path.resolve(process.env.ONLYSTORY_EXE)
  : undefined;
if (executablePath && !fs.existsSync(executablePath))
  throw Error(`Packaged executable does not exist: ${executablePath}`);
for (const file of executablePath
  ? []
  : [
      'desktop/web/index.html',
      'desktop/sources.json',
      'desktop/native-transforms.json',
    ])
  if (!fs.existsSync(file))
    throw Error(`Prepare the desktop app first: missing ${file}.`);
if (
  !executablePath &&
  digest(fs.readFileSync('desktop/sources.json')) !==
    digest(fs.readFileSync('src/downloads/ba/sources.json'))
)
  throw Error(
    'Desktop source manifest is stale. Run desktop preparation after building.',
  );

const output = path.resolve(
  process.env.ONLYSTORY_VERIFICATION_ROOT ?? '.cache',
  'ba-native-verification',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const profile = path.join(output, 'profile');
const originals = path.join(profile, 'originals');
fs.mkdirSync(originals, { recursive: true });
const inputs = [
  ...new Map(
    recipes
      .flatMap((recipe) => recipe.inputs)
      .map((input) => [input.id, input]),
  ).values(),
];
const networkProbe = inputs
  .filter(
    (input) =>
      new URL(input.url).hostname === 'prod-clientpatch.bluearchiveyostar.com',
  )
  .sort((a, b) => a.bytes - b.bytes)[0];
if (!networkProbe)
  throw Error(
    'Selected chapters have no official source for the live download probe.',
  );
const seeded = [];
if (!process.argv.includes('--live')) {
  const paths = read('.cache/ba-all-downloads/input-paths.json');
  for (const input of inputs) {
    if (input.id === networkProbe.id) continue;
    const file = paths[input.id];
    // Some small community reference textures have no retained original path;
    // exercise their real pinned HTTPS downloads rather than prepared outputs.
    if (!file || !fs.existsSync(file)) continue;
    const body = fs.readFileSync(file);
    if (body.length !== input.bytes || digest(body) !== input.sha256)
      throw Error(`Retained original failed verification: ${input.filename}.`);
    const destination = path.join(originals, input.sha256);
    if (!fs.existsSync(destination)) {
      try {
        fs.linkSync(file, destination);
      } catch {
        fs.copyFileSync(file, destination);
      }
    }
    seeded.push(input.id);
  }
}
const nativeLog = path.join(output, 'native-requests.jsonl');
const rendererLog = path.join(output, 'renderer-network.jsonl');
const launcher = path.join(output, 'main.cjs');
const errors = [];
const chapters = [];
const screenshotFailures = [];
let running;
async function capture(page, name) {
  try {
    await page.screenshot({
      path: path.join(output, name + '.png'),
      scale: 'css',
      animations: 'disabled',
      timeout: 15000,
    });
  } catch (error) {
    screenshotFailures.push({ name, error: error.message });
    console.warn(`Screenshot unavailable (${name}): ${error.message}`);
  }
}
let phase = 'online';
let packagedRuntime;

async function launchPackaged(offline) {
  const app = await _electron.launch({
    executablePath,
    args: [`--onlystory-profile=${profile}`],
    env: { ...process.env, ONLYSTORY_DEV_URL: '' },
    timeout: 120000,
  });
  try {
    const runtime = await app.evaluate(
      ({ app, session }, settings) => {
        const fs = process.getBuiltinModule('node:fs');
        const path = process.getBuiltinModule('node:path');
        const crypto = process.getBuiltinModule('node:crypto');
        const record = (file, value) =>
          fs.appendFileSync(
            file,
            JSON.stringify({
              at: new Date().toISOString(),
              phase: settings.phase,
              ...value,
            }) + '\n',
          );
        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (url, options) => {
          record(settings.nativeLog, { type: 'request', url: String(url) });
          if (settings.offline)
            throw Error('Native network disabled for offline verification');
          try {
            const response = await originalFetch(url, options);
            record(settings.nativeLog, {
              type: 'response',
              url: String(url),
              status: response.status,
            });
            return response;
          } catch (error) {
            record(settings.nativeLog, {
              type: 'error',
              url: String(url),
              error: error.message,
            });
            throw error;
          }
        };
        session.defaultSession.webRequest.onBeforeRequest(
          (details, callback) => {
            const remote =
              /^https?:/.test(details.url) &&
              !/^http:\/\/(?:127\.0\.0\.1|localhost):/.test(details.url);
            if (remote)
              record(settings.rendererLog, { url: details.url, blocked: true });
            callback({ cancel: remote });
          },
        );
        const appRoot = app.getAppPath();
        return {
          packaged: app.isPackaged,
          version: app.getVersion(),
          appRoot,
          shellIndexSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(appRoot, 'web/index.html')))
            .digest('hex'),
          sourcesSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(appRoot, 'sources.json')))
            .digest('hex'),
          nativeTransformsSha256: crypto
            .createHash('sha256')
            .update(
              fs.readFileSync(path.join(appRoot, 'native-transforms.json')),
            )
            .digest('hex'),
          recipeCount: fs
            .readdirSync(path.join(appRoot, 'web/assets'))
            .filter((name) => /^ba-\d+\.json-.*\.gz$/.test(name)).length,
          privateDirectoryShipped: fs.existsSync(
            path.join(appRoot, 'web/private'),
          ),
        };
      },
      { offline, phase, nativeLog, rendererLog },
    );
    expect(runtime.packaged).toBe(true);
    expect(runtime.recipeCount).toBe(catalog.length);
    expect(runtime.shellIndexSha256).toBe(
      digest(fs.readFileSync(path.join(webRoot, 'index.html'))),
    );
    expect(runtime.sourcesSha256).toBe(
      digest(fs.readFileSync('src/downloads/ba/sources.json')),
    );
    expect(runtime.nativeTransformsSha256).toBe(
      digest(fs.readFileSync('src/downloads/ba/native-transforms.json')),
    );
    expect(runtime.privateDirectoryShipped).toBe(false);
    packagedRuntime = runtime;
    const context = app.context();
    const page = await app.firstWindow();
    page.on('pageerror', (error) =>
      errors.push({ phase, error: error.message }),
    );
    await page.waitForURL('**/library');
    await page.waitForFunction(
      () => !!navigator.serviceWorker.controller,
      null,
      { timeout: 90000 },
    );
    if (offline) await context.setOffline(true);
    return { page, close: () => app.close() };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function launch(offline) {
  phase = offline ? 'offline' : 'online';
  if (executablePath) return launchPackaged(offline);
  // Instrument the ordinary main process without changing application code.
  // The offline phase blocks native network before app startup. Chromium's
  // external traffic is blocked in both phases: only native original fetches
  // can contact source hosts. Its static server already rejects /private/.
  fs.writeFileSync(
    launcher,
    `
const fs = require('node:fs');
const { app, session } = require('electron');
const record = (file, value) => fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), phase: ${JSON.stringify(phase)}, ...value }) + '\\n');
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  record(${JSON.stringify(nativeLog)}, { type: 'request', url: String(url) });
  if (${offline}) throw Error('Native network disabled for offline verification');
  try {
    const response = await fetchOriginal(url, options);
    record(${JSON.stringify(nativeLog)}, { type: 'response', url: String(url), status: response.status });
    return response;
  } catch (error) {
    record(${JSON.stringify(nativeLog)}, { type: 'error', url: String(url), error: error.message });
    throw error;
  }
};
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  const remote = /^https?:/.test(details.url) && !/^http:\\/\\/(?:127\\.0\\.0\\.1|localhost):/.test(details.url);
  if (remote) record(${JSON.stringify(rendererLog)}, { url: details.url, blocked: true });
  callback({ cancel: remote });
}));
require(${JSON.stringify(path.join(root, 'desktop/main.cjs'))});
`,
  );
  const debug = path.join(profile, 'DevToolsActivePort');
  fs.rmSync(debug, { force: true });
  const child = spawn(
    electronPath,
    [launcher, '--remote-debugging-port=0', `--onlystory-profile=${profile}`],
    {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ONLYSTORY_DEV_URL: '' },
    },
  );
  let log = '';
  const append = (data) => {
    log += data.toString();
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const deadline = Date.now() + 90000;
  while (!fs.existsSync(debug)) {
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw Error('Application did not start: ' + log);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const port = fs.readFileSync(debug, 'utf8').split(/\r?\n/)[0];
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  page.on('pageerror', (error) => errors.push({ phase, error: error.message }));
  await page.waitForURL('**/library');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 90000,
  });
  if (offline) await context.setOffline(true);
  return {
    page,
    close: async () => {
      for (const window of context.pages())
        await window.evaluate(() => window.close()).catch(() => {});
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
      fs.writeFileSync(path.join(output, phase + '-process.log'), log);
    },
  };
}

try {
  console.log(
    'Verifying native BA recipes:',
    recipes.map((recipe) => recipe.episode.id).join(', '),
  );
  console.log(
    `${seeded.length} verified original inputs reused; ${inputs.length - seeded.length} inputs start uncached. No prepared chapters or media are seeded.`,
  );
  running = await launch(false);
  let page = running.page;
  const origin = new URL(page.url()).origin;
  for (const recipe of recipes) {
    const started = Date.now();
    await page.goto(origin + '/downloads/' + recipe.episode.id);
    await expect(
      page.getByRole('button', { name: 'Download and import', exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await page
      .getByRole('button', { name: 'Download and import', exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const alert = await page
            .getByRole('alert')
            .textContent({ timeout: 100 })
            .catch(() => '');
          if (alert) return alert;
          return page.evaluate(
            (id) =>
              !!JSON.parse(localStorage.getItem('onlystory.v1') || '{}')
                .installed?.[id],
            recipe.episode.id,
          );
        },
        { timeout: 600000, intervals: [1000, 2000] },
      )
      .toBe(true);
    const inventory = await page.evaluate(async (episode) => {
      const data = JSON.parse(localStorage.getItem('onlystory.v1'));
      const cache = await caches.open('onlystory.media.v1');
      const chapter = await (await cache.match(episode.content.url)).json();
      const scene = await (await cache.match(episode.content.sceneUrl)).json();
      const missing = [];
      for (const url of data.installations[episode.id].files)
        if (!(await cache.match(url))) missing.push(url);
      return {
        passages: chapter.nodes.length,
        steps: scene.steps.length,
        media: scene.assets.files.length,
        installationFiles: data.installations[episode.id].files.length,
        missing,
      };
    }, recipe.episode);
    expect(inventory.passages).toBe(recipe.episode.content.count);
    expect(inventory.steps).toBe(inventory.passages);
    expect(inventory.media).toBe(recipe.outputs.length);
    expect(inventory.missing).toEqual([]);
    chapters.push({
      id: recipe.episode.id,
      group: recipe.group,
      category: recipe.episode.category,
      ...inventory,
      importMs: Date.now() - started,
    });
    await capture(page, `installed-${recipe.group}`);
    console.log('Imported', recipe.episode.id, inventory);
  }
  const network = fs.existsSync(nativeLog)
    ? fs.readFileSync(nativeLog, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
    : [];
  const successful = network.filter(
    (entry) =>
      entry.phase === 'online' &&
      entry.type === 'response' &&
      entry.status === 200,
  );
  expect(successful.length).toBeGreaterThan(0);
  const verifiedDownloads = [];
  for (const url of new Set(successful.map((entry) => entry.url))) {
    const source = sources.find((input) => input.url === url);
    expect(source, 'Download must be a pinned original').toBeTruthy();
    const body = fs.readFileSync(path.join(originals, source.sha256));
    expect(body.length).toBe(source.bytes);
    expect(digest(body)).toBe(source.sha256);
    verifiedDownloads.push({
      id: source.id,
      url,
      bytes: body.length,
      sha256: source.sha256,
    });
  }
  await running.close();
  running = undefined;
  running = await launch(true);
  page = running.page;
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index];
    await page.goto(origin + `/read/ba/${recipe.episode.id}`);
    await expect(
      page.locator('[data-testid="ba-scene"], video').first(),
    ).toBeVisible({ timeout: 60000 });
    if (await page.getByTestId('ba-scene').count())
      await expect(page.getByTestId('ba-scene')).toHaveAttribute(
        'aria-busy',
        'false',
        { timeout: 60000 },
      );
    else
      await expect
        .poll(
          () =>
            page
              .locator('video')
              .evaluate(
                (video) => video.readyState >= 2 && video.videoWidth > 0,
              ),
          { timeout: 60000 },
        )
        .toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const decoded = await page.evaluate(async (outputs) => {
      const cache = await caches.open('onlystory.media.v1');
      const audio = new AudioContext();
      const result = { audio: 0, movies: [] };
      try {
        for (const output of outputs) {
          if (!/\.(?:ogg|wav|mp4)$/.test(output.url)) continue;
          const response = await cache.match(output.url);
          if (!response) throw Error('Uncached media: ' + output.url);
          if (output.url.endsWith('.mp4')) {
            const url = URL.createObjectURL(await response.blob());
            try {
              const video = document.createElement('video');
              video.preload = 'auto';
              await new Promise((resolve, reject) => {
                const timer = setTimeout(
                  () => reject(Error('Movie decode timed out')),
                  30000,
                );
                video.onloadeddata = () => {
                  clearTimeout(timer);
                  resolve();
                };
                video.onerror = () => {
                  clearTimeout(timer);
                  reject(Error('Movie decode failed'));
                };
                video.src = url;
              });
              if (!video.videoWidth || !video.duration)
                throw Error('Empty movie');
              result.movies.push({
                url: output.url,
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
              });
              video.removeAttribute('src');
              video.load();
            } finally {
              URL.revokeObjectURL(url);
            }
          } else {
            const clip = await audio.decodeAudioData(
              await response.arrayBuffer(),
            );
            if (!clip.length || !clip.duration)
              throw Error('Empty audio: ' + output.url);
            result.audio++;
          }
        }
        return result;
      } finally {
        await audio.close();
      }
    }, recipe.outputs);
    Object.assign(chapters[index], { offlineRestartReady: true, decoded });
    if (recipe.episode.textLocales?.includes('en')) {
      const translated = await page.evaluate(async (episode) => {
        const cache = await caches.open('onlystory.media.v1');
        const chapter = await (await cache.match(episode.content.url)).json();
        return chapter.nodes.find(
          (node) =>
            node.kind === 'text' &&
            node.speaker &&
            node.scene.window !== 'system' &&
            !node.scene.autoAdvance &&
            node.text.en &&
            node.text.ja &&
            node.text.en !== node.text.ja &&
            !/\[USERNAME\]/.test(node.text.en + node.text.ja),
        );
      }, recipe.episode);
      if (translated) {
        await page.evaluate(() => {
          const data = JSON.parse(localStorage.getItem('onlystory.v1'));
          data.preferences.textSpeed = 0;
          localStorage.setItem('onlystory.v1', JSON.stringify(data));
        });
        await page.goto(
          origin +
            `/read/ba/${recipe.episode.id}?line=${encodeURIComponent(translated.id)}`,
        );
        await page
          .getByLabel('Reading language', { exact: true })
          .selectOption('ja');
        await expect(page.locator('.dialogue-window p')).toHaveText(
          translated.text.ja,
        );
        const samePassage = page.url();
        await page
          .getByLabel('Reading language', { exact: true })
          .selectOption('en');
        await expect(page.locator('.dialogue-window p')).toHaveText(
          translated.text.en,
        );
        expect(page.url()).toBe(samePassage);
        await page.goto(origin + `/read/ba/${recipe.episode.id}`);
        await expect(
          page.getByLabel('Reading language', { exact: true }),
        ).toHaveValue('en');
        await expect(page.locator('.dialogue-window p')).toHaveText(
          translated.text.en,
        );
        Object.assign(chapters[index], {
          offlineLanguageSwitch: {
            node: translated.id,
            englishSha256: digest(translated.text.en),
            japaneseSha256: digest(translated.text.ja),
            passagePreserved: true,
            resumedInEnglish: true,
          },
        });
      }
    }
    await capture(page, `offline-${recipe.group}`);
    let choices = 0;
    let movies = 0;
    let cutsceneBarriers = 0;
    for (let turn = 0; turn < 64; turn++) {
      const completed = await page.evaluate(
        (id) =>
          !!JSON.parse(localStorage.getItem('onlystory.v1')).saves[id]
            ?.completed,
        recipe.episode.id,
      );
      if (completed || (await page.locator('.episode-end').isVisible())) break;
      const choice = page.locator('.story-choices button').first();
      const skipMovie = page.getByRole('button', {
        name: 'Skip this movie',
        exact: true,
      });
      const continueStory = page.getByRole('button', {
        name: 'Continue story',
        exact: true,
      });
      if (await choice.isVisible()) {
        await choice.click();
        choices++;
      } else if (await skipMovie.isVisible()) {
        await skipMovie.click();
        movies++;
      } else if (await continueStory.isVisible()) {
        await continueStory.click();
        cutsceneBarriers++;
      } else {
        const fastForward = page.getByRole('button', {
          name: 'Fast-forward',
          exact: true,
        });
        if (await fastForward.isVisible()) await fastForward.click();
        await page.waitForFunction(
          (id) =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')).saves[id]
              ?.completed ||
            !!document.querySelector(
              '.episode-end, .story-choices button, .ba-cutscene-notice button',
            ) ||
            [...document.querySelectorAll('button')].some(
              (button) => button.textContent?.trim() === 'Skip this movie',
            ),
          recipe.episode.id,
          { timeout: 60000 },
        );
      }
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            !!JSON.parse(localStorage.getItem('onlystory.v1')).saves[id]
              ?.completed,
          recipe.episode.id,
        ),
      )
      .toBe(true);
    // Fast-forward may already carry into the next chapter. Its persisted
    // completion proves this chapter finished; reload it to inspect the ending.
    await page.goto(origin + `/read/ba/${recipe.episode.id}`);
    await expect(page.locator('.episode-end')).toBeVisible({ timeout: 60000 });
    Object.assign(chapters[index], {
      offlineCompleted: true,
      choicesSelected: choices,
      moviesSkippedAfterDecode: movies,
      acknowledgedCutsceneBarriers: cutsceneBarriers,
    });
    await capture(page, `offline-complete-${recipe.group}`);
    console.log('Offline reader and media decode', recipe.episode.id, decoded);
  }
  const requests = fs
    .readFileSync(nativeLog, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  expect(requests.filter((entry) => entry.phase === 'offline')).toEqual([]);
  expect(errors).toEqual([]);
  if (recipes.some((recipe) => recipe.episode.textLocales?.includes('en')))
    expect(
      chapters.some(
        (chapter) => chapter.offlineLanguageSwitch?.resumedInEnglish,
      ),
      'The representative EN selection must contain real translated dialogue and pass offline switching/resume',
    ).toBe(true);
  const result = {
    checkedAt: new Date().toISOString(),
    runtime: executablePath
      ? 'Packaged Windows app, shipped production static shell'
      : 'Electron development runtime, prepared production static shell',
    ...(executablePath
      ? {
          executable: executablePath,
          executableSha256: digest(fs.readFileSync(executablePath)),
          packagedRuntime,
        }
      : {}),
    profile,
    live: process.argv.includes('--live'),
    originalInputs: inputs.length,
    seededOriginals: seeded,
    verifiedLiveDownloads: verifiedDownloads,
    preparedAssetsSeeded: 0,
    privateBackendAvailable: false,
    nativeNetworkDisabledOffline: true,
    chromiumNetworkDisabledOffline: true,
    blockedRendererRequests: fs.existsSync(rendererLog)
      ? fs
          .readFileSync(rendererLog, 'utf8')
          .trim()
          .split(/\r?\n/)
          .map(JSON.parse)
      : [],
    chapters,
    screenshotFailures,
    pageErrors: errors,
  };
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(
    'PASS: native originals → BA import → cold offline reader.',
    output,
  );
} catch (error) {
  fs.writeFileSync(
    path.join(output, 'failure.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        phase,
        error: error.stack,
        chapters,
        screenshotFailures,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  if (running?.page) await capture(running.page, 'failure');
  throw error;
} finally {
  await running?.close();
}
