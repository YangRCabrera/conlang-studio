import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { signInWithTestAccount } from './support/clerk-sign-in';

const authFile = path.join(__dirname, '.auth/user.json');
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h — comfortably inside Clerk's session cookie lifetime

setup('authenticate', async ({ page, browser }) => {
  const isFresh =
    fs.existsSync(authFile) &&
    Date.now() - fs.statSync(authFile).mtimeMs < MAX_AGE_MS;

  if (isFresh) {
    // Validate the cached session before trusting it — a stale/revoked
    // session must fail clearly here, not three steps into golden-path.spec.ts.
    const ctx = await browser.newContext({ storageState: authFile });
    const probe = await ctx.newPage();
    await probe.goto('/languages');
    const stillAuthed = await probe
      .getByLabel('New language name')
      .isVisible()
      .catch(() => false);
    await ctx.close();
    if (stillAuthed) return;
  }

  await signInWithTestAccount(page);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
