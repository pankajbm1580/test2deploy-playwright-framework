// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Filter active and completed todos', () => {
  test('Filter by Active and Completed', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });
    const items = page.getByTestId('todo-item');
    const titles = page.getByTestId('todo-title');
    const count = page.getByTestId('todo-count');
    const allLink = page.getByRole('link', { name: 'All' });
    const activeLink = page.getByRole('link', { name: 'Active' });
    const completedLink = page.getByRole('link', { name: 'Completed' });

    // 1. Add 'Buy milk', 'Walk dog', 'Read book'; complete 'Walk dog'
    for (const text of ['Buy milk', 'Walk dog', 'Read book']) {
      await input.fill(text);
      await input.press('Enter');
    }
    await items.filter({ hasText: 'Walk dog' }).getByRole('checkbox', { name: 'Toggle Todo' }).check();
    await expect(items).toHaveCount(3);
    await expect(count).toHaveText('2 items left');

    // 2. Click the 'Active' link
    await activeLink.click();
    await expect(page).toHaveURL(/#\/active$/);
    await expect(items).toHaveCount(2);
    await expect(titles).toHaveText(['Buy milk', 'Read book']);
    await expect(activeLink).toHaveClass(/selected/);

    // 3. Click the 'Completed' link
    await completedLink.click();
    await expect(page).toHaveURL(/#\/completed$/);
    await expect(items).toHaveCount(1);
    await expect(titles).toHaveText(['Walk dog']);
    await expect(completedLink).toHaveClass(/selected/);

    // 4. Click the 'All' link
    await allLink.click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(items).toHaveCount(3);
    await expect(count).toHaveText('2 items left');
  });
});
