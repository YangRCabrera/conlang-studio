import type { Page } from '@playwright/test';

/**
 * Drives the real Clerk sign-in form at `/sign-in` (a full page, not the
 * modal `SignInButton` opens on the landing page) using the dedicated
 * dev-instance test account. The instance has device verification enabled;
 * because the account's email follows Clerk's `+clerk_test` convention, the
 * verification code is always the fixed value 424242 — no real email is
 * sent (see `.claude/skills/verify/SKILL.md`).
 */
export async function signInWithTestAccount(page: Page) {
  const email = process.env.CLERK_TEST_USER_EMAIL;
  const password = process.env.CLERK_TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'CLERK_TEST_USER_EMAIL / CLERK_TEST_USER_PASSWORD must be set in .env for e2e sign-in',
    );
  }

  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // `.isVisible()` checks current state without waiting, so it must be paired
  // with `waitFor` here — the device-verification screen takes a moment to
  // render after the password step's navigation.
  const codeInput = page.getByLabel(/verification code/i);
  const hasCodeStep = await codeInput
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (hasCodeStep) {
    await codeInput.fill('424242');
    // Clerk's OTP field auto-submits once all 6 digits register — clicking
    // "Continue" immediately after `fill()` races that auto-submit and can
    // trigger a premature/empty submission. Wait for the auto-submit's own
    // navigation first, and only click "Continue" as a fallback if it
    // doesn't happen (older/non-auto-submitting Clerk configurations).
    const navigatedOnItsOwn = await page
      .waitForURL(/\/languages$/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!navigatedOnItsOwn) {
      await page
        .getByRole('button', { name: 'Continue', exact: true })
        .click({ timeout: 3_000 })
        .catch(() => {});
    }
  }

  // 15s was tuned against a locally-warmed dev server; CI's redirect
  // involves a real network hop to Clerk plus a fresh Neon connection and
  // has been observed to occasionally exceed that.
  await page.waitForURL(/\/languages$/, { timeout: 30_000 });
}
