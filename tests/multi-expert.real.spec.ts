import { test, expect } from '@playwright/test';

test('@real multi experts respond sequentially (real OpenAI)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!process.env.OPENAI_API_KEY || process.env.USE_MOCK_PROVIDER === '1', 'Requires OPENAI_API_KEY and real provider');
  const base = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000');
  await page.context().addCookies([{ name: 'app_auth', value: '1', domain: base.hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);

  await page.goto('/');
  const tStartStart = Date.now();
  await Promise.all([
    page.getByTestId('start-tech').click(),
    page.waitForURL(/\/[A-Za-z0-9-]+$/)
  ]);
  const startMs = Date.now() - tStartStart;
  console.log(`[timing] session/start navigation: ${startMs}ms`);

  await page.waitForSelector('h1:has-text("Panel discussion")');
  await page.fill('input[placeholder="Say something"]', 'What architecture would you recommend?');
  const tMsgStart = Date.now();
  const [msgResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/message') && r.request().method() === 'POST', { timeout: 120_000 }),
    page.click('button:has-text("Send")')
  ]);
  const msgMs = Date.now() - tMsgStart;
  console.log(`[timing] message POST (full turn): ${msgMs}ms status=${msgResp.status()}`);

  // Expect multiple expert bubbles to appear over time
  const tFirstVisible = Date.now();
  await expect(page.locator('[data-testid="bubble-expert"]').first()).toBeVisible({ timeout: 60_000 });
  console.log(`[timing] first expert visible: ${Date.now() - tFirstVisible}ms`);
  const tSecondVisible = Date.now();
  await expect(page.locator('[data-testid="bubble-expert"], [data-testid="bubble-moderator"]').nth(1)).toBeVisible({ timeout: 60_000 });
  console.log(`[timing] second expert visible: ${Date.now() - tSecondVisible}ms`);
});


