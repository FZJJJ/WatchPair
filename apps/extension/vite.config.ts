import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: {
    alias: {
      '@watchpair/protocol': resolve(import.meta.dirname, '../../packages/protocol/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        'popup/index': resolve(import.meta.dirname, 'src/popup/index.html'),
        'background/service-worker': resolve(
          import.meta.dirname,
          'src/background/service-worker.ts',
        ),
        'content/content-script': resolve(import.meta.dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
