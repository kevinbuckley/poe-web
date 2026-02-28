import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const LLM_TIMEOUT = 60_000; // 60s for real LLM responses

test.describe('POE Platform UAT', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for personas to load from API (auto-seeded on first load)
    await page.waitForSelector('[data-testid="persona-list"]', { timeout: 15_000 });
    // Ensure personas are visible (not just the container)
    await page.waitForSelector('[data-testid="persona-item"]', { timeout: 15_000 });
  });

  test('1. page loads with POE heading and persona list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'POE Platform' })).toBeVisible();
    const personaItems = page.locator('[data-testid="persona-item"]');
    await expect(personaItems.first()).toBeVisible();
    const count = await personaItems.count();
    expect(count).toBeGreaterThanOrEqual(4); // 4 seeded personas
    
    // No active session initially
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/No active session/i);
  });

  test('2. create panel button disabled when no personas selected', async ({ page }) => {
    const createBtn = page.locator('[data-testid="create-panel-btn"]');
    await expect(createBtn).toBeDisabled();
  });

  test('3. persona selection works and shows count', async ({ page }) => {
    const personaItems = page.locator('[data-testid="persona-item"]');
    
    await personaItems.nth(0).click();
    await expect(page.getByText(/1\/8 selected/)).toBeVisible();
    
    await personaItems.nth(1).click();
    await expect(page.getByText(/2\/8 selected/)).toBeVisible();
    
    // Deselect first
    await personaItems.nth(0).click();
    await expect(page.getByText(/1\/8 selected/)).toBeVisible();
    
    // Create button now enabled
    const createBtn = page.locator('[data-testid="create-panel-btn"]');
    await expect(createBtn).toBeEnabled();
  });

  test('4. mode selector has both options', async ({ page }) => {
    const modeSelect = page.locator('[data-testid="panel-mode-select"]');
    await expect(modeSelect).toBeVisible();
    await modeSelect.selectOption('pipeline_parallel');
    await expect(modeSelect).toHaveValue('pipeline_parallel');
    await modeSelect.selectOption('scatter_gather');
    await expect(modeSelect).toHaveValue('scatter_gather');
  });

  test('5. chat input disabled before session is created', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /Send/i });
    await expect(sendBtn).toBeDisabled();
  });

  test('6. full flow: create panel → session → send message → receive response', async ({ page }) => {
    // Select Socrates
    const socratesItem = page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' });
    await socratesItem.click();
    
    // Set panel name and create
    await page.locator('[data-testid="panel-name-input"]').fill('Philosophy Panel');
    await page.locator('[data-testid="create-panel-btn"]').click();
    
    // Session should start
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });
    
    // Chat input is accessible — fill text first (Send button disabled when empty)
    const chatInput = page.getByPlaceholder(/Ask the panel/i);
    await expect(chatInput).toBeEnabled({ timeout: 5_000 });
    await chatInput.fill('What is justice?');

    // Now Send button is enabled (has text + session active)
    const sendBtn = page.getByRole('button', { name: /Send/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();
    
    // User message appears (optimistic)
    await expect(page.getByText('What is justice?')).toBeVisible();
    
    // Mediator status changes
    await expect(page.locator('[data-testid="mediator-status"]'))
      .not.toContainText('idle', { timeout: 15_000 });
    
    // Wait for second message bubble to appear (user msg is 1st, expert response is 2nd+)
    await expect(page.locator('[data-testid="message-bubble"]').nth(1))
      .toBeVisible({ timeout: LLM_TIMEOUT });

    // At least user + 1 expert response
    const count = await page.locator('[data-testid="message-bubble"]').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('7. streaming shows cursor during response generation', async ({ page }) => {
    await page.locator('[data-testid="persona-item"]').first().click();
    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });
    
    await page.getByPlaceholder(/Ask the panel/i).fill('Tell me something interesting.');
    await page.getByRole('button', { name: /Send/i }).click();
    
    // Wait for typing indicator  
    await expect(page.locator('[data-testid="agent-statuses"]'))
      .not.toContainText('No active speakers', { timeout: 15_000 });
    
    // Streaming cursor (▌) should appear while typing
    await expect(page.locator('[data-streaming="true"]')).toBeVisible({ timeout: LLM_TIMEOUT });
    
    // Eventually stream ends
    await expect(page.locator('[data-streaming="true"]')).not.toBeVisible({ timeout: LLM_TIMEOUT });
  });

  test('8. multi-persona panel routes correctly', async ({ page }) => {
    // Select both Socrates and Mark
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' }).click();
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Mark' }).click();
    
    await expect(page.getByText(/2\/8 selected/)).toBeVisible();
    
    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });
    
    // Send message
    await page.getByPlaceholder(/Ask the panel/i).fill('What makes a great leader?');
    await page.getByRole('button', { name: /Send/i }).click();
    
    // Someone responds
    await expect(page.locator('[data-testid="message-bubble"]').nth(1))
      .toBeVisible({ timeout: LLM_TIMEOUT });
    
    // The responding author should be one of our personas
    const secondBubble = page.locator('[data-testid="message-bubble"]').nth(1);
    const author = await secondBubble.getAttribute('data-author');
    expect(['socrates', 'mark-vc']).toContain(author);
  });

  test('9. @mention routes message to specific persona', async ({ page }) => {
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' }).click();
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Mark' }).click();
    
    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });
    
    // Mention Mark directly
    await page.getByPlaceholder(/Ask the panel/i).fill('@mark-vc What is your investment thesis?');
    await page.getByRole('button', { name: /Send/i }).click();
    
    // Wait for response
    await expect(page.locator('[data-testid="message-bubble"]').nth(1))
      .toBeVisible({ timeout: LLM_TIMEOUT });
    
    // Mark should respond (mediator routing respects @mention)
    const responder = page.locator('[data-testid="message-bubble"]').nth(1);
    const author = await responder.getAttribute('data-author');
    expect(author).toBe('mark-vc');
  });

  test('10. admin costs endpoint is accessible', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/v1/admin/costs');
    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    expect(json).toHaveProperty('sessions');
    expect(json).toHaveProperty('total_rows');
  });
});
