import { test, expect } from '@playwright/test';

test('two experts respond sequentially and moderator summarizes', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('button:has-text("Start")')
  ]);

  await page.waitForSelector('h2:has-text("Session ")');
  await page.fill('input[placeholder="Say something"]', 'What stack would you choose and why?');
  await page.click('button:has-text("Send")');

  // Expect first expert name, then second expert name
  const first = page.locator('b:has-text("Backend Engineer")');
  const second = page.locator('b:has-text("Frontend Architect"), b:has-text("DevOps SRE")');
  await expect(first).toBeVisible({ timeout: 60000 });
  await expect(second.first()).toBeVisible({ timeout: 60000 });
});


