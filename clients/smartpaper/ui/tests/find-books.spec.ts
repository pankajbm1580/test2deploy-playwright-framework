
import { test, expect } from '@playwright/test';

test.use({
  viewport: {
    width: 1440,
    height: 1000,
  },
});

const ISBN = '9789948686668';

test('Smartpaper: sign in, search book, request scan, and inspect My Requests', async ({
  page,
}) => {
  // 1. Read credentials loaded from the project-root .env file.
  const username = process.env.UI_USERNAME;
  const password = process.env.UI_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'Missing UI_USERNAME or UI_PASSWORD. Check your .env file and ensure loadEnvFile() runs in playwright.smartpaper.config.ts.',
    );
  }

  // 2. Open Smartpaper and sign in.
  await page.goto('https://www.smartpaper.fi/en');

  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.getByRole('textbox', { name: 'Email' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);

  await page
    .locator('form')
    .getByRole('button', { name: 'Sign In' })
    .click();

  // 3. Search for the book by ISBN.
  const searchBox = page.getByRole('searchbox', {
    name: 'Enter book title, author name',
  });

  await expect(searchBox).toBeVisible({ timeout: 15000 });
  await searchBox.fill(ISBN);

  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText(ISBN).first()).toBeVisible({
    timeout: 15000,
  });

  // 4. Open the scan-request dialog.
  await page
    .getByRole('button', { name: 'Request Scan' })
    .first()
    .click();

  const cancelButton = page.getByRole('button', {
    name: 'Cancel',
  });

  const confirmButton = page.getByRole('button', {
    name: 'Confirm Request',
  });

  await expect(cancelButton).toBeVisible({ timeout: 10000 });
  await expect(confirmButton).toBeVisible({ timeout: 10000 });

  // Follow the keyboard interaction captured in Codegen.
  await cancelButton.focus();
  await cancelButton.press('Tab');

  await expect(confirmButton).toBeFocused();
  await confirmButton.press('Enter');

  // 5. Wait for the next action after confirmation.
  const viewRequestsButton = page.getByRole('button', {
    name: 'View My Requests',
  });

  await expect(viewRequestsButton).toBeVisible({
    timeout: 10000,
  });

  await viewRequestsButton.click();

  // 6. Verify the My Requests page lists the new request as open.
  await expect(
    page.getByText('What you asked for, what is on offer near you'),
  ).toBeVisible({ timeout: 15000 });

  await expect(page.getByText('Your requests')).toBeVisible();

  // A single request card: contains this ISBN and no second ISBN, so a
  // wrapper around several cards cannot match.
  const openRequest = page
    .locator('div')
    .filter({ hasText: `ISBN ${ISBN}` })
    .filter({ hasNotText: /ISBN[\s\S]*ISBN/ })
    .filter({ hasText: 'Open' })
    .filter({ has: page.getByRole('button', { name: 'Cancel request' }) });

  await expect(openRequest.first()).toBeVisible();
  await expect(openRequest.first()).toContainText(
    'Staatsbibliothek zu Berlin',
  );

  // Deliberately do not submit or cancel another request here.
});
