// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Delete a todo', () => {
  test('Delete a todo via the destroy button', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const items = page.getByTestId('todo-item');

    // 1. Add 'Buy milk' and 'Walk dog'; hover over the 'Buy milk' todo-item
    await input.fill('Buy milk');
    await input.press('Enter');
    await input.fill('Walk dog');
    await input.press('Enter');
    const milk = items.filter({ hasText: 'Buy milk' });
    await milk.hover();
    const deleteButton = milk.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();

    // 2. Click the 'Delete' button
    await deleteButton.click();
    await expect(items).toHaveCount(1);
    await expect(page.getByTestId('todo-title')).toHaveText('Walk dog');
    await expect(page.getByTestId('todo-count')).toHaveText('1 item left');
  });
});
