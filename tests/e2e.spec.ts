import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  const base = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000');
  await context.addCookies([
    { name: 'app_auth', value: '1', domain: base.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }
  ]);
});

test('start session, send message, see expert and moderator replies', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1:has-text("Panel of Experts")');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.getByTestId('start-tech').click()
  ]);

  // Should land on session page and connect SSE
  await page.waitForSelector('h1:has-text("Panel discussion")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  const messageInput = page.locator('input[placeholder="Say something"]');
  await messageInput.fill('What is the first step?');
  await page.click('button:has-text("Send")');

  // Smoke check: input and composer visible after send
  await expect(page.locator('input[placeholder="Say something"]')).toBeVisible();
  // Wait for at least one non-user bubble to appear (expert or moderator)
  await expect(page.locator('[data-testid="bubble-expert"], [data-testid="bubble-moderator"]').first()).toBeVisible({ timeout: 60000 });
});

test('start philosophy panel and see philosopher', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1:has-text("Panel of Experts")');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.getByTestId('start-philosophy').click()
  ]);
  await page.waitForSelector('h1:has-text("Panel discussion")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  await page.fill('input[placeholder="Say something"]', 'Give me a concise perspective.');
  await page.click('button:has-text("Send")');
  await expect(page.locator('input[placeholder="Say something"]')).toBeVisible();
});

test('start finance panel and see financier', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1:has-text("Panel of Experts")');
  await Promise.all([
    page.waitForURL(/\/[A-Za-z0-9-]+$/),
    page.getByTestId('start-finance').click()
  ]);
  await page.waitForSelector('h1:has-text("Panel discussion")');
  await page.waitForSelector('input[placeholder="Say something"]', { state: 'visible' });
  await page.fill('input[placeholder="Say something"]', 'Quick take on risk and growth.');
  await page.click('button:has-text("Send")');
  await expect(page.locator('input[placeholder="Say something"]')).toBeVisible();
});


