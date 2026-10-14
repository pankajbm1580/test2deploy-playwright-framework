// spec: clients/demo/ui/specs/todomvc.md
// seed: clients/demo/ui/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Edit a todo', () => {
  test('Edit a todo title and save with Enter', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const editBox = page.getByRole('textbox', { name: 'Edit' });

    // 1. Add 'Buy milk', then double-click its todo-title
    await input.fill('Buy milk');
    await input.press('Enter');
    await page.getByTestId('todo-title').dblclick();
    await expect(editBox).toBeVisible();
    await expect(editBox).toHaveValue('Buy milk');

    // 2. Fill the Edit textbox with 'Buy oat milk' and press Enter
    await editBox.fill('Buy oat milk');
    await editBox.press('Enter');
    await expect(editBox).toBeHidden();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await expect(page.getByTestId('todo-title')).toHaveText('Buy oat milk');
    await expect(page.getByTestId('todo-count')).toHaveText('1 item left');
  });
});
