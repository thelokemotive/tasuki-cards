import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

// `vite build --mode single` produces dist-single/tasuki-cards.html: one self-contained file
// that works when opened directly from disk (file://) in Chrome.
function renameSingleFile() {
  return {
    name: 'tasuki-rename-single',
    closeBundle() {
      const from = resolve(__dirname, 'dist-single/index.html');
      if (existsSync(from)) renameSync(from, resolve(__dirname, 'dist-single/tasuki-cards.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [viteSingleFile(), renameSingleFile()] : [])],
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
