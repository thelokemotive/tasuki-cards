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

// The website build only: the Home Screen app (manifest, icons, service worker in public/). The single file
// keeps none of it, so it stays one self-contained file with no network.
function installable() {
  return {
    name: 'tasuki-installable',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' as const },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: './icons/icon-192.png' }, injectTo: 'head' as const },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' as const },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    publicDir: single ? false : 'public',
    plugins: [react(), ...(single ? [viteSingleFile(), renameSingleFile()] : mode === 'production' ? [installable()] : [])],
    define: {
      // The website build (`vite build`) signs in with Firebase; the single file and dev stay offline.
      __WEB__: JSON.stringify(mode === 'production'),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
      // One worker: this laptop runs close to its memory commit limit, and parallel forks crashed.
      maxWorkers: 1,
    },
  };
});
