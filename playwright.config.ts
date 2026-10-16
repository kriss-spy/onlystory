import { defineConfig } from '@playwright/test';
import { localPort } from './scripts/local-environment.mjs';

const baseURL = `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1365, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
