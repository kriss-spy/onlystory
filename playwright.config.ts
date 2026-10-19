import { defineConfig } from '@playwright/test';
import { localPort } from './scripts/local-environment.mjs';

const baseURL = `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/pwa/**',
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1365, height: 900 },
    // Thousands of catalog rows make per-action DOM snapshots intrusive.
    // Keep action and screenshot traces; failures also capture the DOM.
    trace: { mode: 'retain-on-failure', snapshots: false },
    // Production service-worker behavior has its own suite and origin.
    serviceWorkers: 'block',
  },
  webServer: {
    command:
      'npm run build -- --mode browser-test && node scripts/browser-test-server.mjs',
    timeout: 120000,
    url: baseURL,
    reuseExistingServer: false,
  },
});
