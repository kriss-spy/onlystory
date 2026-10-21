// One-chapter feasibility test. Original source files enter Chrome through a file
// input. The HTTP host serves static code/metadata only and rejects private assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium, expect } from '@playwright/test';
import { prepare } from './ba-import-experiment/prepare.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = path.join(root, '.cache/ba-browser-import');
fs.mkdirSync(work, { recursive: true });
if (!fs.existsSync(path.join(work, 'node_modules/unity-asset-reader'))) {
  for (const n of ['package.json', 'package-lock.json'])
    fs.copyFileSync(
      path.join(root, 'scripts/ba-import-experiment', n),
      path.join(work, n),
    );
  if (process.platform === 'win32')
    execFileSync(
      process.env.ComSpec || 'cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        'npm ci --prefix .cache/ba-browser-import --no-audit --no-fund',
      ],
      { cwd: root, stdio: 'inherit' },
    );
  else
    execFileSync('npm', ['ci', '--prefix', work, '--no-audit', '--no-fund'], {
      cwd: root,
      stdio: 'inherit',
    });
}
const { recipe, localPaths } = await prepare(root);
const output = path.join(work, 'dist');
await build({
  configFile: false,
  root: path.join(root, 'scripts/ba-import-experiment'),
  base: '/__ba-import/',
  resolve: {
    alias: [
      'unity-asset-reader',
      'unity-asset-reader-texture',
      '@zip.js/zip.js',
      'fflate',
    ].map((name) => ({
      find: name,
      replacement: path.join(work, 'node_modules', name),
    })),
  },
  worker: { format: 'es' },
  build: { outDir: output, emptyOutDir: true, copyPublicDir: false },
});
fs.copyFileSync(
  path.join(work, 'recipe.json'),
  path.join(output, 'recipe.json'),
);
fs.cpSync(
  path.join(work, 'node_modules/texture2ddecoder-wasm/wasm'),
  path.join(output, 'wasm'),
  { recursive: true },
);
if (process.argv.includes('--prepare-only')) {
  console.log(`Prepared static experiment at ${output}`);
  process.exit(0);
}
if (!fs.existsSync(path.join(root, 'dist/index.html')))
  throw Error('Run npm run build before the browser probe.');
const privateRequests = [],
  network = [],
  pageErrors = [];
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/private/')) {
    privateRequests.push(u.pathname);
    res.writeHead(403).end('No game assets on this host');
    return;
  }
  const experiment = u.pathname.startsWith('/__ba-import/');
  const base = experiment ? output : path.join(root, 'dist');
  let relative = decodeURIComponent(
    experiment ? u.pathname.slice('/__ba-import/'.length) : u.pathname.slice(1),
  );
  if (!relative || !path.extname(relative)) relative = 'index.html';
  const file = path.resolve(base, relative);
  if (
    !file.startsWith(base + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    mime[path.extname(file)] || 'application/octet-stream',
  );
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + '/')) {
      network.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(origin + '/__ba-import/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(
    await page.evaluate(
      async () =>
        (await (await caches.open('onlystory.media.v1')).keys()).length,
    ),
    0,
  );
  // A wrong same-size original must fail before publishing anything.
  const wrong = Buffer.from(fs.readFileSync(localPaths[0]));
  wrong[wrong.length - 1] ^= 1;
  await page.locator('#files').setInputFiles([
    {
      name: recipe.inputs[0].filename,
      mimeType: 'application/octet-stream',
      buffer: wrong,
    },
  ]);
  await page.locator('#import').click();
  await page.waitForFunction(() => !!window.importError);
  assert.match(
    await page.evaluate(() => window.importError),
    /checksum mismatch/,
  );
  assert.equal(
    await page.evaluate(
      async () =>
        (await (await caches.open('onlystory.media.v1')).keys()).length,
    ),
    0,
  );
  // Every file below is an upstream original, never a pre-extracted export.
  await page.locator('#files').setInputFiles(localPaths);
  await page.locator('#import').click();
  await page.waitForFunction(
    () => !!window.importResult || !!window.importError,
    null,
    { timeout: 180000 },
  );
  assert.equal(await page.evaluate(() => window.importError), null);
  const result = await page.evaluate(() => window.importResult);
  assert.equal(result.outputs, recipe.outputs.length);
  assert.equal(result.inputs, recipe.inputs.length);
  const cached = (url) =>
    page.evaluate(
      async (url) =>
        await (
          await (await caches.open('onlystory.media.v1')).match(url)
        ).json(),
      url,
    );
  assert.deepEqual(
    await cached(recipe.episode.content.url),
    JSON.parse(
      fs.readFileSync(
        path.join(root, 'public/private/ba-jp/11000/chapter.json'),
      ),
    ),
  );
  const expectedProgram = JSON.parse(
    fs.readFileSync(path.join(root, 'public/private/ba-jp/11000/scenes.json')),
  );
  expectedProgram.assets.files = result.files;
  assert.deepEqual(
    await cached(recipe.episode.content.sceneUrl),
    expectedProgram,
  );
  const audioComparisons = [];
  for (const sound of result.audio) {
    const decoded = await page.evaluate(async (sound) => {
      const response = await (
        await caches.open('onlystory.media.v1')
      ).match(sound.url);
      const decoder = new OfflineAudioContext(
        sound.channels,
        1,
        sound.frequency,
      );
      const audio = await decoder.decodeAudioData(await response.arrayBuffer());
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
        audio.getChannelData(i),
      );
      const samples = [];
      for (let i = 0; i < audio.length; i++)
        for (const c of channels)
          samples.push(
            Math.max(-32768, Math.min(32767, Math.round(c[i] * 32768))),
          );
      return {
        frames: audio.length,
        channels: audio.numberOfChannels,
        samples,
      };
    }, sound);
    assert.equal(decoded.frames, sound.frames);
    assert.equal(decoded.channels, sound.channels);
    const reference = fs.readFileSync(path.join(root, 'public', sound.url));
    let at = 12;
    while (reference.toString('ascii', at, at + 4) !== 'data')
      at += 8 + reference.readUInt32LE(at + 4);
    const pcm = reference.subarray(
      at + 8,
      at + 8 + reference.readUInt32LE(at + 4),
    );
    assert.equal(pcm.length, decoded.samples.length * 2);
    let maxError = 0,
      squareError = 0;
    for (let i = 0; i < decoded.samples.length; i++) {
      const d = pcm.readInt16LE(i * 2) - decoded.samples[i];
      maxError = Math.max(maxError, Math.abs(d));
      squareError += d * d;
    }
    assert.ok(maxError <= 2, `${sound.url}: max PCM error ${maxError}`);
    audioComparisons.push({
      url: sound.url,
      frames: sound.frames,
      channels: sound.channels,
      maxPcmError: maxError,
      rmsPcmError: Math.sqrt(squareError / decoded.samples.length),
    });
  }
  console.log(
    `Browser import passed: ${result.outputs} files, ${audioComparisons.length} sound effects decoded`,
  );
  await page.goto(origin + '/read/ba/ba-jp-11000');
  await expect(page.getByTestId('ba-scene')).toBeVisible({ timeout: 30000 });
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  offline.on('pageerror', (e) => pageErrors.push(e.message));
  await offline.goto(origin + '/read/ba/ba-jp-11000');
  await expect(offline.getByTestId('ba-scene')).toBeVisible({ timeout: 30000 });
  await expect(offline.locator('.dialogue-window p')).not.toBeEmpty();
  await expect(offline.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  await expect(offline.locator('.scene-notices')).toHaveCount(0);
  await offline.screenshot({ path: path.join(work, 'offline-prologue.png') });
  // Follow a complete authored path, stopping at each real choice prompt.
  const chosen = [];
  for (let i = 0; i < result.choices + 1; i++) {
    await offline
      .getByRole('button', { name: 'Fast-forward', exact: true })
      .click();
    await offline.waitForFunction(
      () =>
        !!document.querySelector('.episode-end') ||
        !!document.querySelector('.story-choices button'),
      null,
      { timeout: 45000 },
    );
    if (await offline.locator('.episode-end').count()) break;
    const option = offline.locator('.story-choices button').first();
    await expect(offline.locator('.scene-notices')).toHaveCount(0);
    await offline.screenshot({
      path: path.join(work, `offline-choice-${i + 1}.png`),
    });
    chosen.push(await option.innerText());
    await option.click();
  }
  await expect(offline.locator('.episode-end')).toContainText('読了', {
    timeout: 30000,
  });
  await offline.screenshot({ path: path.join(work, 'offline-complete.png') });
  assert.equal(chosen.length, result.choices);
  await expect(offline.locator('.scene-notices')).toHaveCount(0);
  assert.deepEqual(network, []);
  // Existing cache migration probes this optional index. The host rejects it,
  // just like every other private URL; no game bytes come from the host.
  assert.deepEqual(
    privateRequests.filter((url) => url !== '/private/shared/index.json'),
    [],
  );
  assert.deepEqual(pageErrors, []);
  const counts = recipe.outputs.reduce((m, a) => {
    m[a.kind] = (m[a.kind] || 0) + 1;
    return m;
  }, {});
  const evidence = {
    checkedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    originalFiles: result.inputs,
    originalBytes: recipe.inputs.reduce((n, a) => n + a.bytes, 0),
    rebuiltMediaFiles: result.outputs,
    types: counts,
    models: result.models,
    sourceRows: result.sourceRows,
    nodes: result.chapterNodes,
    choicePrompts: result.choices,
    completedChoices: chosen,
    elapsedImportMs: result.elapsedMs,
    textureComparisons: recipe.outputs
      .filter((a) => a.kind === 'texture')
      .map(({ url, maxChannelError, differingChannels }) => ({
        url,
        maxChannelError,
        differingChannels,
      })),
    audioComparisons,
    blockedExternalRequests: network,
    privateRequests,
    pageErrors,
    offlineCompletion: true,
    limitations: [
      'Technical experiment only, no product import UI.',
      'One pinned JP prologue, desktop Chrome only.',
      'ASTC decoder rounding differs from the native reference by at most one 8-bit channel value.',
      'Two pinned Vorbis setup headers only.',
      'The 156-file download experience has not been simplified.',
    ],
  };
  fs.writeFileSync(
    path.join(work, 'results.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    `PASS: offline prologue completed through ${chosen.length} choice prompts; evidence ${work}/results.json`,
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
