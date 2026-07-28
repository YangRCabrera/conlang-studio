import { test as base, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

type Fixtures = {
  /** Registers a language name for delete-via-UI teardown after the test, pass or fail. */
  trackLanguage: (name: string) => string;
  /**
   * Bypasses Clerk's bot detection before the test's first navigation.
   * These specs reuse a `storageState` session rather than calling
   * `signInWithTestAccount`, but the client-side Clerk SDK still re-syncs
   * that session's Frontend API calls on every fresh page load — which is
   * what bot detection stalls from a CI runner's IP. `auto: true` so every
   * test gets it without remembering to call it by hand.
   */
  clerkTestingToken: void;
};

export const test = base.extend<Fixtures>({
  clerkTestingToken: [
    async ({ page }, use) => {
      await setupClerkTestingToken({ page });
      await use();
    },
    { auto: true },
  ],

  trackLanguage: async ({ page }, use) => {
    const created: string[] = [];

    await use((name: string) => {
      created.push(name);
      return name;
    });

    await page.goto('/languages');
    for (const name of created) {
      const row = page.locator('li').filter({ hasText: name });
      if (await row.count()) {
        // Delete now opens a confirmation dialog rather than deleting
        // directly — confirm it before moving on.
        await row.getByRole('button', { name: 'Delete' }).click();
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Delete' })
          .click();
      }
    }
  },
});

export { expect };
