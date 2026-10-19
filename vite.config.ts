import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { libraryPlugin } from './scripts/library-plugin.mjs';
import { localPort } from './scripts/local-environment.mjs';
import { pwaPlugin } from './scripts/pwa-plugin.mjs';
import { Features } from 'lightningcss';

export default defineConfig({
  // Keep native color-scheme switching. Lowering light-dark() to a system-media
  // query would ignore the user's explicit per-game appearance preference.
  css: { lightningcss: { exclude: Features.LightDark } },
  server: {
    host: '127.0.0.1',
    port: localPort,
    strictPort: true,
    watch: {
      ignored: [
        '**/.cache/**',
        '**/.audit/**',
        '**/test-results*/**',
        '**/playwright-report/**',
      ],
    },
  },
  optimizeDeps: { entries: ['index.html'] },
  preview: { host: '127.0.0.1', port: localPort, strictPort: true },
  build: { copyPublicDir: false },
  plugins: [react(), libraryPlugin(), pwaPlugin()],
});
