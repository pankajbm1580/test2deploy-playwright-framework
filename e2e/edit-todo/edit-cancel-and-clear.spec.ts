// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Edit a todo', () => {
  test('Cancel edit with Escape and clearing text removes todo', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const editBox = page.getByRole('textbox', { name: 'Edit' });
    const title = page.getByTestId('todo-title');

    // 1. Add 'Buy milk', double-click it, fill 'Changed', press Escape
    await input.fill('Buy milk');
    await input.press('Enter');
    await title.dblclick();
    await editBox.fill('Changed');
    await editBox.press('Escape');
    await expect(editBox).toBeHidden();
    await expect(title).toHaveText('Buy milk');

    // 2. Double-click again, clear the Edit textbox, press Enter
    await title.dblclick();
    await editBox.fill('');
    await editBox.press('Enter');
    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });
});
