import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Skip any test tagged with @live by default.
  // We run the @live tests in a separate step or project if needed.
  grepInvert: /@live/,
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Use the fake, in-memory deterministic GitHub client for E2E tests.
      // This ensures 100% stable tests without network/rate-limit flakes.
      CODELENS_FAKE_GITHUB: '1',
    },
  },
});
