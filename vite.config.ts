import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { libraryPlugin } from './scripts/library-plugin.mjs';
import { localPort } from './scripts/local-environment.mjs';
import { pwaPlugin } from './scripts/pwa-plugin.mjs';
import { Features } from 'lightningcss';
import { previewCompression } from './scripts/preview-compression.mjs';

// Tailscale Serve forwards this Host header to the loopback server. Keep the
// allowance in config so a fresh shell after reboot can read the host library.
const allowedHosts = ['wtb.tailf4ab12.ts.net'];

export default defineConfig({
  // Keep native color-scheme switching. Lowering light-dark() to a system-media
  // query would ignore the user's explicit per-game appearance preference.
  css: { lightningcss: { exclude: Features.LightDark } },
  server: {
    host: '127.0.0.1',
    allowedHosts,
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
  preview: {
    host: '127.0.0.1',
    allowedHosts,
    port: localPort,
    strictPort: true,
  },
  build: {
    copyPublicDir: false,
    assetsInlineLimit: (file) =>
      file.endsWith('.json.gz') ? false : undefined,
  },
  plugins: [
    react(),
    libraryPlugin(),
    pwaPlugin(),
    {
      name: 'onlystory-preview-compression',
      configurePreviewServer(server) {
        server.middlewares.use(previewCompression(server.config.build.outDir));
      },
    },
  ],
});
