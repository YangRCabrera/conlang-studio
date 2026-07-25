import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config'; // this process isn't `next dev` — env vars need explicit loading

const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // One shared Clerk test account and one shared real dev DB (no per-worker
  // isolation) — parallel workers would mean concurrent logins on the same
  // Clerk dev-instance account and concurrent language creation/cleanup
  // against the same database.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium-authed',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /golden-path\.spec\.ts/,
    },
    {
      name: 'chromium-anon',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /anon-demo\.spec\.ts/,
    },
    {
      name: 'chromium-signin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /sign-in\.spec\.ts/,
    },
    {
      // Defaults to the authenticated session (the "authenticated pages"
      // describe block relies on this); the "public pages" block overrides
      // to a signed-out context per-test via `test.use()`.
      name: 'chromium-a11y',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /a11y\.spec\.ts/,
    },
  ],
});
