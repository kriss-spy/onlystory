import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa',
  fullyParallel: true,
  workers: 2,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    channel: 'chrome',
    viewport: { width: 1365, height: 900 },
    trace: 'retain-on-failure',
  },
});
