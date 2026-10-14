import { test, expect } from '@playwright/test';

const ISBN = '9789948686668';

test('P1: Search for a known ISBN', async ({ page }) => {
  await page.goto('main');

  const searchBox = page.getByRole('searchbox', {
    name: 'Enter book title, author name',
  });

  await expect(searchBox).toBeVisible();

  // WebKit can fill the box before the page hydrates, and hydration then
  // clears it. Re-fill until the value sticks before searching.
  await expect(async () => {
    await searchBox.fill(ISBN);
    await expect(searchBox).toHaveValue(ISBN, { timeout: 1000 });
  }).toPass({ timeout: 10000 });

  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText(ISBN).first()).toBeVisible({
    timeout: 15000,
  });
});

test('P2: Empty book search is handled safely', async ({ page }) => {
  await page.goto('main');

  const searchBox = page.getByRole('searchbox', {
    name: 'Enter book title, author name',
  });

  await expect(searchBox).toBeVisible();
  await searchBox.fill('');

  await page.getByRole('button', { name: 'Search' }).click();

  // The application should remain usable after an empty search.
  await expect(searchBox).toBeVisible();
});
