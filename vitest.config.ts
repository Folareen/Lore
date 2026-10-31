import { defineConfig } from 'vitest/config';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    setupFiles: ['apps/web/src/test/setup.ts'],
    // Bound JSDOM concurrency so interaction tests do not compete for every local core.
    maxWorkers: 2,
    testTimeout: 15_000,
    include: [
      'packages/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'apps/web/**/*.test.tsx',
    ],
  },
});
