import fs from 'node:fs';
import path from 'node:path';
import { _electron, expect } from '@playwright/test';

const output = path.resolve('.cache/desktop-verification');
fs.mkdirSync(output, { recursive: true });
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg
  ? path.resolve(profileArg.slice('--profile='.length))
  : path.join(
      output,
      process.argv.includes('--live') ? `live-${Date.now()}` : 'cached-profile',
    );
const executablePath = process.env.ONLYSTORY_EXE;
const recipe = JSON.parse(
  fs.readFileSync('src/downloads/ba/recipe.json', 'utf8'),
);
const launch = () =>
  _electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(executablePath ? [] : ['desktop']),
      `--onlystory-profile=${profile}`,
    ],
  });
let app;
const errors = [];
try {
  app = await launch();
  let page = await app.firstWindow();
  await page.waitForURL('**/library');
  await page.waitForLoadState('domcontentloaded');
  const origin = new URL(page.url()).origin;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/downloads/ba-jp-11000');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(
    page.getByRole('button', { name: 'Download and import', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, 'download-ui.png'),
    scale: 'css',
  });
  await page
    .getByRole('button', { name: 'Download and import', exact: true })
    .click();
  const timer = setInterval(async () => {
    try {
      console.log(
        (await page.locator('.acquisition-card').first().innerText()).slice(
          0,
          350,
        ),
      );
    } catch {}
  }, 15000);
  try {
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
        { timeout: 480000 },
      )
      .not.toBe('working');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Read story', exact: true }),
    ).toBeVisible();
  } finally {
    clearInterval(timer);
  }
  const originals = fs
    .readdirSync(path.join(profile, 'originals'))
    .filter((name) => recipe.inputs.some((input) => input.sha256 === name));
  expect(originals).toHaveLength(recipe.inputs.length);
  const choiceCount = await page.evaluate(async (url) => {
    const cache = await caches.open('onlystory.media.v1');
    const chapter = await (await cache.match(url)).json();
    return chapter.nodes.filter((node) => node.kind === 'choice').length;
  }, recipe.episode.content.url);
  await page.screenshot({ path: path.join(output, 'download-complete.png') });
  await app.close();
  app = undefined;
  // A new process, same saved profile. Disable both native and Chromium network
  // clients before opening the reader; local packaged code still works.
  app = await launch();
  await app.evaluate(async ({ session }) => {
    globalThis.fetch = async () => {
      throw Error('Native network disabled for offline verification');
    };
    session.defaultSession.enableNetworkEmulation({ offline: true });
  });
  page = await app.firstWindow();
  await page.waitForURL('**/library');
  await page.waitForLoadState('domcontentloaded');
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/read/ba/ba-jp-11000');
  await expect(page.getByTestId('ba-scene')).toHaveAttribute(
    'aria-busy',
    'false',
    { timeout: 30000 },
  );
  await expect(page.locator('.scene-notices')).toHaveCount(0);
  const choices = [];
  for (let i = 0; i <= choiceCount; i++) {
    await page
      .getByRole('button', { name: 'Fast-forward', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !!document.querySelector('.episode-end') ||
        !!document.querySelector('.story-choices button'),
      null,
      { timeout: 45000 },
    );
    await expect(page.locator('.scene-notices')).toHaveCount(0);
    if (await page.locator('.episode-end').count()) break;
    await page.screenshot({
      path: path.join(output, `offline-choice-${i + 1}.png`),
    });
    const option = page.locator('.story-choices button').first();
    choices.push(await option.innerText());
    await option.click();
  }
  await expect(page.locator('.episode-end')).toContainText('読了');
  expect(choices).toHaveLength(choiceCount);
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(output, 'offline-complete.png') });
  const evidence = {
    checkedAt: new Date().toISOString(),
    executable: executablePath ?? 'Electron development runtime',
    profile,
    live: process.argv.includes('--live'),
    originals: originals.length,
    completedChoices: choices.length,
    offlineRestartCompleted: true,
    pageErrors: errors,
  };
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    'PASS: native download, browser import and offline restart completed.',
    evidence,
  );
} finally {
  await app?.close();
}
