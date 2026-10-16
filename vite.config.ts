import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { libraryPlugin } from './scripts/library-plugin.mjs';

export default defineConfig({
  build: { copyPublicDir: false },
  plugins: [react(), libraryPlugin()],
});
