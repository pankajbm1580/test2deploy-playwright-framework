import { test, expect } from '@playwright/test';

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
    await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible();
  });
});
