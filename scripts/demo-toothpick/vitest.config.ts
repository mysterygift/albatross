import path from 'path'
import { defineConfig } from 'vitest/config'

// Standalone config for the Toothpick demo generator (not part of the app's own test suite).
// Run:  npx vitest run --config scripts/demo-toothpick/vitest.config.ts
export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  resolve: { alias: { '@': path.resolve(__dirname, '../../src') } },
  test: {
    environment: 'node',
    include: ['scripts/demo-toothpick/**/*.gen.ts'],
    setupFiles: ['scripts/demo-toothpick/lib/mocks.ts'],
    globals: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // build must finish before verify reads its output
    fileParallelism: false,
    sequence: { files: 'list' } as never,
  },
})
