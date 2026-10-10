// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Complete a todo', () => {
  test('Mark a todo complete and uncomplete it', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const items = page.getByTestId('todo-item');
    const count = page.getByTestId('todo-count');
    const clearCompleted = page.getByRole('button', { name: 'Clear completed' });

    // 1. Add todos 'Buy milk' and 'Walk dog'
    await input.fill('Buy milk');
    await input.press('Enter');
    await input.fill('Walk dog');
    await input.press('Enter');
    await expect(items).toHaveCount(2);
    await expect(count).toHaveText('2 items left');

    // 2. Check the 'Toggle Todo' checkbox of 'Buy milk'
    const milk = items.filter({ hasText: 'Buy milk' });
    const dog = items.filter({ hasText: 'Walk dog' });
    const milkCheckbox = milk.getByRole('checkbox', { name: 'Toggle Todo' });
    await milkCheckbox.check();
    await expect(milk).toHaveClass(/completed/);
    await expect(milkCheckbox).toBeChecked();
    await expect(dog).not.toHaveClass(/completed/);
    await expect(dog.getByRole('checkbox', { name: 'Toggle Todo' })).not.toBeChecked();
    await expect(count).toHaveText('1 item left');
    await expect(clearCompleted).toBeVisible();

    // 3. Uncheck the same checkbox
    await milkCheckbox.uncheck();
    await expect(milk).not.toHaveClass(/completed/);
    await expect(count).toHaveText('2 items left');
    await expect(clearCompleted).toBeHidden();
  });
});
