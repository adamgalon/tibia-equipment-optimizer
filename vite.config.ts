import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The bundled item catalog (~120 KB gzipped) is most of the size; that is expected.
  build: { chunkSizeWarningLimit: 1000 },
});
