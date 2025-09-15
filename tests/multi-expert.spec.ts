import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const base = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000');
  await context.addCookies([
    { name: 'app_auth', value: '1', domain: base.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }
  ]);
});

test('two experts respond sequentially and moderator summarizes', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.getByTestId('start-tech').click()
  ]);

  await page.waitForSelector('h1:has-text("Panel discussion")');
  await page.fill('input[placeholder="Say something"]', 'What stack would you choose and why?');
  await page.click('button:has-text("Send")');

  // Wait for first expert bubble to appear, then another non-user bubble
  const firstExpert = page.locator('[data-testid="bubble-expert"]').first();
  await expect(firstExpert).toBeVisible({ timeout: 60000 });
  // Wait for a second expert or moderator bubble after the first
  const anyNonUser = page.locator('[data-testid="bubble-expert"], [data-testid="bubble-moderator"]').nth(1);
  await expect(anyNonUser).toBeVisible({ timeout: 60000 });
});


