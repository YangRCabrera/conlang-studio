import { test, expect } from './fixtures';

test('authenticated user builds a minimal language and generates a word', async ({
  page,
  trackLanguage,
}) => {
  const languageName = trackLanguage(`e2e-golden-${Date.now()}`);

  // 1. Create the language.
  await page.goto('/languages');
  await page.getByLabel('New language name').fill(languageName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: languageName }).click();
  await expect(page).toHaveURL(/\/languages\/[0-9a-f-]{36}$/);
  const languageId = page.url().match(/languages\/([0-9a-f-]{36})/)![1];

  // 2. Add two phonemes — go through the dashboard's "start here" CTA since
  // the language has none yet.
  await page.getByRole('link', { name: 'Add your first phoneme' }).click();
  const phonemesSection = page.locator('section').filter({ hasText: 'Phonemes' });
  const groupsSection = page.locator('section').filter({ hasText: 'Groups' });

  for (const symbol of ['p', 'a']) {
    await phonemesSection.getByLabel('Symbol').fill(symbol);
    await phonemesSection.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(phonemesSection.getByText(`Symbol: ${symbol}`)).toBeVisible();
  }

  // 3. Create a phoneme group, then edit it to check both phonemes in as members.
  await groupsSection.getByLabel('New Group').fill('core');
  await groupsSection.getByRole('button', { name: 'Add', exact: true }).click();
  await groupsSection.getByRole('button', { name: 'Edit' }).click();
  await groupsSection.getByLabel('[ <p> ]').check();
  await groupsSection.getByLabel('[ <a> ]').check();
  await groupsSection.getByRole('button', { name: 'Save' }).click();
  // `getByText` would match just the inner <strong>Members: </strong>, not
  // the member list that follows it as a sibling text node — scope to the
  // whole <p> row instead.
  const membersRow = groupsSection.locator('p').filter({ hasText: 'Members:' });
  await expect(membersRow).toContainText('<p>');
  await expect(membersRow).toContainText('<a>');

  // 4. Add a syllable structure built from the group (the form pre-selects
  // the first group in its dropdown, so "+ Add slot" alone is enough here).
  await page.goto(`/languages/${languageId}/syllables`);
  await page.getByRole('button', { name: 'Add Syllable Structure' }).click();
  await page.getByRole('button', { name: '+ Add slot' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Template:')).toBeVisible();

  // 5. Generate words and add one to the dictionary.
  await page.goto(`/languages/${languageId}/wordgen`);
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('No words have been generated yet.')).toHaveCount(0);

  // The "Add to Dictionary" affordance is a +/checkmark button whose
  // accessible name comes from its `title` attribute, not its text content.
  const addButton = page.getByTitle('Add to Dictionary').first();
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByTitle('Added to Dictionary').first()).toBeVisible();
});
