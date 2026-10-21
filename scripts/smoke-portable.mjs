import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const version = JSON.parse(
  fs.readFileSync('desktop/package.json', 'utf8'),
).version;
const executable = path.resolve(
  process.env.ONLYSTORY_PORTABLE ||
    `release/Onlystory-${version}-portable-x64.exe`,
);
const output = path.resolve('.cache/portable-smoke');
const profile = path.join(output, `profile-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const child = spawn(
  executable,
  ['--remote-debugging-port=0', `--onlystory-profile=${profile}`],
  { windowsHide: true, stdio: 'ignore' },
);
let browser;
try {
  const debug = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 60000;
  while (!fs.existsSync(debug)) {
    if (Date.now() > deadline || child.exitCode !== null)
      throw Error('Portable executable did not start its application window.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const port = fs.readFileSync(debug, 'utf8').split(/\r?\n/)[0];
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForURL('**/library');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto(new URL(page.url()).origin + '/downloads/ba-jp-11000');
  await expect(
    page.getByRole('button', { name: 'Download and import', exact: true }),
  ).toBeVisible();
  const runtime = await page.evaluate(() => ({
    desktop: !!window.onlystoryDesktop,
    platform: window.onlystoryDesktop?.platform,
    nodeIntegration: typeof require !== 'undefined',
    secure: isSecureContext,
  }));
  expect(runtime).toEqual({
    desktop: true,
    platform: 'win32',
    nodeIntegration: false,
    secure: true,
  });
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.screenshot({
    path: path.join(output, 'portable-download-ui.png'),
    scale: 'css',
  });
  await page.goto(
    new URL(page.url()).origin + '/games/pjsk?category=Main+story',
  );
  await page
    .getByRole('button', { name: 'Select stories to download', exact: true })
    .click();
  await page.locator('.download-selection-checkbox:enabled').first().check();
  await expect(
    page.getByRole('button', { name: /Download selected stories/ }),
  ).not.toHaveAccessibleName('Download selected stories (0)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: path.join(output, 'pjsk-downloads-dark.png'),
    scale: 'css',
  });
  await context.route('https://storage.sekai.best/**', () => {});
  await page.getByRole('button', { name: /Download selected stories/ }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Download progress' }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, 'pjsk-download-progress.png'),
    scale: 'css',
  });
  await page
    .getByRole('button', { name: 'Cancel downloads', exact: true })
    .click();
  await expect(
    page.getByRole('progressbar', { name: 'Download progress' }),
  ).toHaveCount(0);
  const result = {
    checkedAt: new Date().toISOString(),
    executable,
    bytes: fs.statSync(executable).size,
    sha256: createHash('sha256')
      .update(fs.readFileSync(executable))
      .digest('hex'),
    runtime,
    startupPassed: true,
    catalogSelectionPassed: true,
    downloadProgressPassed: true,
  };
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(
    'PASS: portable executable launches the packaged download UI.',
    result,
  );
  await page.evaluate(() => window.close()).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null) child.kill();
  }
}
