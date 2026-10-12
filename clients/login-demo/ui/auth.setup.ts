import { test as setup, expect } from '@playwright/test';
import { loginStatePath, resolveLoginCredentials, saveLoginState } from '../../../framework/support/login';
import { loginDemoClient } from '../client.config';

/**
 * Logs in once per run and saves the signed-in browser state for every browser project.
 * To adapt it to a real app, change only the steps marked APP-SPECIFIC: the login URL,
 * the field and button locators, and the check that proves the login worked.
 */
setup('Log in and save the signed-in state', async ({ page }) => {
  const { username, password } = resolveLoginCredentials();

  await page.goto('./login'); // APP-SPECIFIC: the login page, relative to UI_BASE_URL.
  await page.getByLabel('Username').fill(username); // APP-SPECIFIC locators.
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // APP-SPECIFIC: something only a signed-in user sees. Fails here, with no credentials shown, if the login was rejected.
  await expect(page.getByRole('heading', { name: 'Account' }), 'The login was not accepted').toBeVisible();

  await saveLoginState(page.context(), loginStatePath(loginDemoClient));
});
