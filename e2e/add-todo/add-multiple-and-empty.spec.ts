// spec: specs/todomvc.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Add a todo', () => {
  test('Add multiple todos and ignore empty input', async ({ page }) => {
    await page.goto('./');
    const input = page.getByRole('textbox', { name: 'What needs to be done?' });

    // 1. Press Enter in the empty input, then type only spaces and press Enter
    await input.press('Enter');
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.getByTestId('todo-item')).toHaveCount(0);

    // 2. Add '  Buy milk  ' (with surrounding spaces), then 'Walk dog'
    await input.fill('  Buy milk  ');
    await input.press('Enter');
    await input.fill('Walk dog');
    await input.press('Enter');
    const titles = page.getByTestId('todo-title');
    await expect(titles).toHaveCount(2);
    await expect(titles).toHaveText(['Buy milk', 'Walk dog']);
    await expect(page.getByTestId('todo-count')).toHaveText('2 items left');
  });
});
