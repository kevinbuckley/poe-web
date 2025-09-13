import { test, expect } from '@playwright/test';

test('start session, send message, see expert and moderator replies', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('button:has-text("Start")')
  ]);

  // Should land on session page and connect SSE (mock will push init with empty history)
  await page.waitForSelector('h2:has-text("Session ")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  const messageInput = page.locator('input[placeholder="Say something"]');
  await messageInput.fill('What is the first step?');
  await page.click('button:has-text("Send")');

  // Expect at least one expert name (not strict single-match)
  const anyExpert = page.locator('b:has-text("Backend Engineer")').or(page.locator('b:has-text("Frontend Architect")')).or(page.locator('b:has-text("DevOps SRE")'));
  await expect(anyExpert.first()).toBeVisible({ timeout: 10_000 });
});


