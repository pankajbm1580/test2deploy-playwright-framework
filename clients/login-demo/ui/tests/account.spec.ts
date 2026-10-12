import { test, expect } from '@playwright/test';

// These tests start from the state saved by ../auth.setup.ts: no login step here.
test.describe('Signed-in session', () => {
  test('Opens the account page without logging in again', async ({ page }) => {
    await page.goto('./account');

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  });
});

test.describe('Without the saved state', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('The account page redirects to the login page', async ({ page }) => {
    await page.goto('./account');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
