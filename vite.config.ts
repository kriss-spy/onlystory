import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { libraryPlugin } from './scripts/library-plugin.mjs';
import { localPort } from './scripts/local-environment.mjs';

export default defineConfig({
  server: { host: '127.0.0.1', port: localPort, strictPort: true },
  preview: { host: '127.0.0.1', port: localPort, strictPort: true },
  build: { copyPublicDir: false },
  plugins: [react(), libraryPlugin()],
});
