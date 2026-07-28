import { test, expect } from '@playwright/test';
import { signInWithTestAccount } from './support/clerk-sign-in';

test('test account can sign in through the real Clerk form, including device verification', async ({
  page,
}) => {
  await signInWithTestAccount(page);
  await expect(page).toHaveURL(/\/languages$/);
  await expect(page.getByLabel('New language name')).toBeVisible();
});
