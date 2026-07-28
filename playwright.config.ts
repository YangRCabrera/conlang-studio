import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config'; // this process isn't `next dev` — env vars need explicit loading

const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Locally this budgets a single test end-to-end against an already-warm
  // dev server. In CI, the same flow crosses a real network hop to Clerk
  // plus queries against a freshly created Neon branch — both measurably
  // slower than local, so golden-path's many-step scenario needs more room
  // there. Individual assertions inherit this via `expect.timeout` below.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
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
    // `next dev` compiles routes on demand — the first hit to an
    // uncompiled route can take well past the default action/test
    // timeouts on a cold CI runner. A production build removes that
    // per-route compile penalty entirely (and better matches prod
    // behavior). Local runs keep `next dev` since `reuseExistingServer`
    // means this command usually isn't even invoked there.
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 180_000 : 60_000,
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
