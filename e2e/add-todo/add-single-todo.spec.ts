// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Add a todo', () => {
  test('Add a single todo', async ({ page }) => {
    // 1. Navigate to https://demo.playwright.dev/todomvc/ with an empty list
    await page.goto('https://demo.playwright.dev/todomvc/');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
    await expect(page.getByTestId('todo-count')).toBeHidden();
    await expect(page.getByRole('link', { name: 'All' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Active' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Completed' })).toBeHidden();

    // 2. Fill the input with 'Buy milk' and press Enter
    await input.fill('Buy milk');
    await input.press('Enter');
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await expect(page.getByTestId('todo-title')).toHaveText('Buy milk');
    await expect(page.getByRole('checkbox', { name: 'Toggle Todo' })).not.toBeChecked();
    await expect(page.getByTestId('todo-count')).toHaveText('1 item left');
    await expect(input).toHaveValue('');
  });
});
