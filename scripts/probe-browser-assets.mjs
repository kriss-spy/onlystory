import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Research probe, separate from offline tests. It samples public upstream files
// without downloading the game library. Pass a recorded target ID to probe one.
const evidence = JSON.parse(
  readFileSync(
    new URL('../docs/browser-asset-probe-results.json', import.meta.url),
    'utf8',
  ),
);
const targets = evidence.results.filter(
  ({ id }) => !process.argv[2] || id === process.argv[2],
);
if (!targets.length) throw Error('Unknown target ID');
const output = resolve('.cache/browser-source-audit/latest.json');
mkdirSync(resolve('.cache/browser-source-audit'), { recursive: true });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Source access probe</title>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.goto(origin);
  const results = [];
  for (const { id, url } of targets) {
    const browserResult = await page.evaluate(async (target) => {
      try {
        const response = await fetch(target, {
          credentials: 'omit',
          signal: AbortSignal.timeout(15000),
        });
        const reader = response.body?.getReader();
        let sampledBytes = 0;
        if (reader) {
          sampledBytes = (await reader.read()).value?.byteLength ?? 0;
          await reader.cancel();
        }
        return {
          status: response.status,
          type: response.type,
          contentType: response.headers.get('content-type'),
          sampledBytes,
        };
      } catch (error) {
        return { error: String(error) };
      }
    }, url);
    let http;
    try {
      const response = await fetch(url, {
        headers: { Origin: 'https://onlystory.example', Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(15000),
      });
      http = {
        status: response.status,
        allowOrigin: response.headers.get('access-control-allow-origin'),
        allowHeaders: response.headers.get('access-control-expose-headers'),
        contentRange: response.headers.get('content-range'),
        contentType: response.headers.get('content-type'),
      };
      await response.body?.cancel();
    } catch (error) {
      http = { error: String(error) };
    }
    results.push({ id, url, browser: browserResult, http });
    console.log(
      `${id}: browser ${browserResult.status ?? browserResult.error}; HTTP ${http.status ?? http.error}`,
    );
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        browserVersion: browser.version(),
        origin,
        results,
        consoleErrors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Evidence: ${output}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
