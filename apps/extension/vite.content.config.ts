import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  publicDir: false,
  resolve: {
    alias: {
      '@watchpair/protocol': resolve(import.meta.dirname, '../../packages/protocol/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        'content/content-script': resolve(import.meta.dirname, 'src/content/content-script.ts'),
      },
      output: {
        inlineDynamicImports: true,
        entryFileNames: '[name].js',
      },
    },
  },
});
