import { expect, test } from '@playwright/test';

test.describe('Conversational naturalness', () => {
  test('produces multi-expert cycle with synthesis and mention steering', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Advanced/i }).click();

    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' }).click();
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Mark' }).click();
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Niels' }).click();

    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });

    await page.getByPlaceholder(/Ask the panel/i).fill('Debate the strongest objection to this plan.');
    await page.getByRole('button', { name: /Send/i }).click();

    await expect(page.locator('[data-testid="message-bubble"][data-author="socrates"]').first())
      .toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid="message-bubble"][data-author="mark-vc"]').first())
      .toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-testid="message-bubble"][data-author="mediator"]').first())
      .toBeVisible({ timeout: 60_000 });

    await page.getByPlaceholder(/Ask the panel/i).fill('@mark-vc rebut Socrates directly in two points.');
    await page.getByRole('button', { name: /Send/i }).click();

    await expect(page.locator('[data-testid="message-bubble"][data-author="mark-vc"]').nth(1))
      .toBeVisible({ timeout: 60_000 });
  });
});
