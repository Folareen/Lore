import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          },
        }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/test/e2e-stack.ts',
    url: 'http://127.0.0.1:4322/api/health',
    reuseExistingServer: false,
    timeout: 60000,
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: process.env.LORE_LIVE_MEDIA_TEST === '1' ? 60000 : 15000,
    },
  },
});
