import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Content scripts in MV3 must be classic scripts, so this entry is bundled
// as a self-contained IIFE into dist/content.js without clearing the main
// build output.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
      formats: ['iife'],
      name: 'AiwfContent',
      fileName: () => 'content.js',
    },
  },
});
