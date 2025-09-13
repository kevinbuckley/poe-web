import { test, expect } from '@playwright/test';

test('@real multi experts respond sequentially (real OpenAI)', async ({ page }) => {
  test.skip(!process.env.OPENAI_API_KEY || process.env.USE_MOCK_PROVIDER === '1', 'Requires OPENAI_API_KEY and real provider');

  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('button:has-text("Start")')
  ]);

  await page.waitForSelector('h2:has-text("Session ")');
  await page.fill('input[placeholder="Say something"]', 'What architecture would you recommend?');
  await page.click('button:has-text("Send")');

  // Expect multiple expert names to appear over time
  await expect(page.locator('b:has-text("Backend Engineer")')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('b:has-text("Frontend Architect"), b:has-text("DevOps SRE")')).toBeVisible({ timeout: 60_000 });
});


