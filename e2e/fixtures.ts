import { test as base, expect } from '@playwright/test';

type Fixtures = {
  /** Registers a language name for delete-via-UI teardown after the test, pass or fail. */
  trackLanguage: (name: string) => string;
};

export const test = base.extend<Fixtures>({
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
