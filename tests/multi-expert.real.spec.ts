import { test, expect } from '@playwright/test';

test('@real multi experts respond sequentially (real OpenAI)', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!process.env.OPENAI_API_KEY || process.env.USE_MOCK_PROVIDER === '1', 'Requires OPENAI_API_KEY and real provider');

  await page.goto('/');
  const tStartStart = Date.now();
  const [startResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/session/start') && r.request().method() === 'GET'),
    page.click('a:has-text("Start Tech")')
  ]);
  const startMs = Date.now() - tStartStart;
  console.log(`[timing] session/start: ${startMs}ms status=${startResp.status()}`);
  await page.waitForURL(/\/[A-Za-z0-9-]+$/);

  await page.waitForSelector('h2:has-text("Session ")');
  await page.fill('input[placeholder="Say something"]', 'What architecture would you recommend?');
  const tMsgStart = Date.now();
  const [msgResp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/message') && r.request().method() === 'POST', { timeout: 120_000 }),
    page.click('button:has-text("Send")')
  ]);
  const msgMs = Date.now() - tMsgStart;
  console.log(`[timing] message POST (full turn): ${msgMs}ms status=${msgResp.status()}`);

  // Expect multiple expert names to appear over time
  const tFirstVisible = Date.now();
  await expect(page.locator('b:has-text("Ada (inspired by Lovelace)")')).toBeVisible({ timeout: 60_000 });
  console.log(`[timing] first expert visible: ${Date.now() - tFirstVisible}ms`);
  const tSecondVisible = Date.now();
  const secondAny = page.locator('b:has-text("Linus (inspired by Torvalds)")').or(page.locator('b:has-text("Grace (inspired by Hopper)")'));
  await expect(secondAny.first()).toBeVisible({ timeout: 60_000 });
  console.log(`[timing] second expert visible: ${Date.now() - tSecondVisible}ms`);
});


