import { test, expect } from '@playwright/test';

test('start session, send message, see expert and moderator replies', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('a:has-text("Start Tech")')
  ]);

  // Should land on session page and connect SSE (mock will push init with empty history)
  await page.waitForSelector('h2:has-text("Session ")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  const messageInput = page.locator('input[placeholder="Say something"]');
  await messageInput.fill('What is the first step?');
  await page.click('button:has-text("Send")');

  // Expect at least one expert name from Tech panel
  const anyExpert = page.locator('b:has-text("Ada (inspired by Lovelace)")')
    .or(page.locator('b:has-text("Linus (inspired by Torvalds)")'))
    .or(page.locator('b:has-text("Grace (inspired by Hopper)")'));
  await expect(anyExpert.first()).toBeVisible({ timeout: 10_000 });
});

test('start philosophy panel and see philosopher', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('a:has-text("Start Philosophy")')
  ]);
  await page.waitForSelector('h2:has-text("Session ")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  await page.fill('input[placeholder="Say something"]', 'Give me a concise perspective.');
  await page.click('button:has-text("Send")');
  const anyExpert = page.locator('b:has-text("Aristotle")').or(page.locator('b:has-text("Nietzsche")')).or(page.locator('b:has-text("Laozi")'));
  await expect(anyExpert.first()).toBeVisible({ timeout: 10_000 });
});

test('start finance panel and see financier', async ({ page }) => {
  await page.goto('/');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.click('a:has-text("Start Finance")')
  ]);
  await page.waitForSelector('h2:has-text("Session ")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  await page.fill('input[placeholder="Say something"]', 'Quick take on risk and growth.');
  await page.click('button:has-text("Send")');
  const anyExpert = page.locator('b:has-text("Warren (inspired by Buffett)")')
    .or(page.locator('b:has-text("Ray (inspired by Dalio)")'))
    .or(page.locator('b:has-text("Cathie (inspired by Wood)")'));
  await expect(anyExpert.first()).toBeVisible({ timeout: 10_000 });
});


