// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Filter active and completed todos', () => {
  test('Filtered views update live when todos change', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const items = page.getByTestId('todo-item');
    const titles = page.getByTestId('todo-title');
    const count = page.getByTestId('todo-count');

    // 1. Add 'Buy milk' and 'Walk dog', click 'Active', then check 'Buy milk'
    await input.fill('Buy milk');
    await input.press('Enter');
    await input.fill('Walk dog');
    await input.press('Enter');
    await page.getByRole('link', { name: 'Active' }).click();
    await expect(page).toHaveURL(/#\/active$/);
    // click() rather than check(): the item leaves the Active view immediately, so check() cannot verify it.
    await items.filter({ hasText: 'Buy milk' }).getByRole('checkbox', { name: 'Toggle Todo' }).click();
    await expect(items).toHaveCount(1);
    await expect(titles).toHaveText(['Walk dog']);
    await expect(count).toHaveText('1 item left');

    // 2. Click 'Completed'
    await page.getByRole('link', { name: 'Completed' }).click();
    await expect(page).toHaveURL(/#\/completed$/);
    await expect(items).toHaveCount(1);
    await expect(titles).toHaveText(['Buy milk']);
    await expect(items.getByRole('checkbox', { name: 'Toggle Todo' })).toBeChecked();

    // 3. Uncheck 'Buy milk' in Completed view
    // click() rather than uncheck(): the item leaves the Completed view immediately.
    await items.getByRole('checkbox', { name: 'Toggle Todo' }).click();
    await expect(items).toHaveCount(0);
    await expect(count).toHaveText('2 items left');
  });
});
