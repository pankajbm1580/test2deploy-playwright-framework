// spec: clients/demo/ui/specs/todomvc.md
// seed: clients/demo/ui/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Delete a todo', () => {
  test('Delete the last remaining todo and clear completed', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const items = page.getByTestId('todo-item');

    // 1. Add 'Buy milk', hover and click 'Delete'
    await input.fill('Buy milk');
    await input.press('Enter');
    await items.hover();
    await items.getByRole('button', { name: 'Delete' }).click();
    await expect(items).toHaveCount(0);
    await expect(page.getByTestId('todo-count')).toBeHidden();
    await expect(page.getByRole('link', { name: 'All' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Active' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Completed' })).toBeHidden();

    // 2. Add 'A' and 'B', complete 'A', click 'Clear completed'
    await input.fill('A');
    await input.press('Enter');
    await input.fill('B');
    await input.press('Enter');
    await items.filter({ hasText: 'A' }).getByRole('checkbox', { name: 'Toggle Todo' }).check();
    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(items).toHaveCount(1);
    await expect(page.getByTestId('todo-title')).toHaveText('B');
    await expect(page.getByTestId('todo-count')).toHaveText('1 item left');
  });
});
