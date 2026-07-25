import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const demoLanguageId = process.env.NEXT_PUBLIC_DEMO_LANGUAGE_ID;

/**
 * Scans the current page with axe-core, scoped to WCAG 2.0/2.1 A and AA
 * rules (this project's target conformance level — see CLAUDE.md's a11y
 * notes) rather than axe's full default set, which also includes
 * best-practice rules that are more subjective. Automated scanning catches
 * roughly a third of real issues (missing labels, contrast, invalid ARIA) —
 * it complements, not replaces, the manual keyboard/screen-reader passes
 * this project's a11y work has otherwise relied on.
 */
async function scanForViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const summary = results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)\n  ${v.helpUrl}`,
    )
    .join('\n');

  expect(results.violations, summary).toEqual([]);
}

test.describe('public pages (signed out)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('landing page has no automatically detectable a11y violations', async ({
    page,
  }) => {
    await page.goto('/');
    await scanForViolations(page);
  });

  test('sign-in page has no automatically detectable a11y violations', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').waitFor({ state: 'visible' });
    await scanForViolations(page);
  });

  test.skip(
    !demoLanguageId,
    'NEXT_PUBLIC_DEMO_LANGUAGE_ID not set — no public demo language configured',
  );
  test('public demo language page has no automatically detectable a11y violations', async ({
    page,
  }) => {
    await page.goto(`/languages/${demoLanguageId}`);
    await scanForViolations(page);
  });
});

test.describe('authenticated pages', () => {
  test('languages list has no automatically detectable a11y violations', async ({
    page,
  }) => {
    await page.goto('/languages');
    await scanForViolations(page);
  });

  test('a language\'s phonemes, syllables, rules, and dictionary pages have no automatically detectable a11y violations', async ({
    page,
    trackLanguage,
  }) => {
    const languageName = trackLanguage(`e2e-a11y-${Date.now()}`);

    await page.goto('/languages');
    await page.getByPlaceholder('New language name').fill(languageName);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: languageName }).click();
    await expect(page).toHaveURL(/\/languages\/[0-9a-f-]{36}$/);
    const languageId = page.url().match(/languages\/([0-9a-f-]{36})/)![1];

    // Overview page, empty state (no phonemes yet).
    await scanForViolations(page);

    // Phonemes & Groups — add one phoneme so the row's Edit/Delete controls
    // (and their confirmation dialog) are part of the scanned DOM, not just
    // the empty-state copy.
    await page.goto(`/languages/${languageId}/phonemes`);
    const phonemesSection = page
      .locator('section')
      .filter({ hasText: 'Phonemes' });
    await phonemesSection.getByPlaceholder('Symbol *').fill('p');
    await phonemesSection.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(phonemesSection.getByText('Symbol: p')).toBeVisible();
    await scanForViolations(page);

    // Open the delete confirmation dialog — scan it while open, since a
    // Radix portal renders outside the normal DOM flow and is easy to miss
    // in a scan that only ever looks at the closed state.
    await phonemesSection.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await scanForViolations(page);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Syllable Structures — empty state (no phonemes committed to a group).
    await page.goto(`/languages/${languageId}/syllables`);
    await scanForViolations(page);

    // Rules — empty state.
    await page.goto(`/languages/${languageId}/rules`);
    await scanForViolations(page);

    // Dictionary — add one word so the table (not just the empty-state
    // copy) is part of the scan.
    await page.goto(`/languages/${languageId}/dictionary`);
    await page.getByLabel('Term').first().fill('example');
    await page.getByRole('button', { name: 'Add Word' }).click();
    await expect(page.getByText('example', { exact: true })).toBeVisible();
    await scanForViolations(page);
  });
});
