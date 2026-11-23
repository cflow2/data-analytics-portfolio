/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Classic (IIFE) worker: module workers from blob: URLs don't load when the page is opened via file://.
  worker: { format: 'iife' },
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 10_000 },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // src/__local__ holds ad-hoc checks against private files; run explicitly with TRACKER=… npx vitest run src/__local__
    exclude: process.env.TRACKER ? [] : ['src/__local__/**', 'node_modules/**'],
  },
});
