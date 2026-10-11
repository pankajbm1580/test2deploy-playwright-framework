// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete a todo', () => {
  test("Complete all todos with 'Mark all as complete'", async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });

    // 1. Add 'Buy milk' and 'Walk dog', then click the 'Mark all as complete' toggle
    await input.fill('Buy milk');
    await input.press('Enter');
    await input.fill('Walk dog');
    await input.press('Enter');
    await page.getByLabel('Mark all as complete').click();

    const items = page.getByTestId('todo-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveClass(/completed/);
    await expect(items.nth(1)).toHaveClass(/completed/);
    await expect(items.nth(0).getByRole('checkbox', { name: 'Toggle Todo' })).toBeChecked();
    await expect(items.nth(1).getByRole('checkbox', { name: 'Toggle Todo' })).toBeChecked();
    await expect(page.getByTestId('todo-count')).toHaveText('0 items left');
  });
});
