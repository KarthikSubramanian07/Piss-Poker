import { defineConfig, devices } from '@playwright/test';

const port = 5173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  projects: [{ name: 'phone', use: { ...devices['iPhone 14 Pro Max'], defaultBrowserType: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
