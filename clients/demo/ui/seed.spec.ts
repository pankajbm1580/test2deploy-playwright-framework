import { test, expect } from '@playwright/test';

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible();
  });
});
