import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const LLM_TIMEOUT = 60_000;

test.describe('POE Platform UAT', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: /Advanced/i }).click();
    await page.waitForSelector('[data-testid="persona-list"]', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="persona-item"]', { timeout: 15_000 });
  });

  test('1. page loads with heading and persona list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'POE Platform' })).toBeVisible();
    const personaItems = page.locator('[data-testid="persona-item"]');
    await expect(personaItems.first()).toBeVisible();
    expect(await personaItems.count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/No active session/i);
  });

  test('2. create panel button disabled when no personas selected', async ({ page }) => {
    await expect(page.locator('[data-testid="create-panel-btn"]')).toBeDisabled();
  });

  test('3. persona selection works and shows count', async ({ page }) => {
    const personaItems = page.locator('[data-testid="persona-item"]');
    await personaItems.nth(0).click();
    await expect(page.getByText(/1\/8 selected/)).toBeVisible();

    await personaItems.nth(1).click();
    await expect(page.getByText(/2\/8 selected/)).toBeVisible();

    await personaItems.nth(0).click();
    await expect(page.getByText(/1\/8 selected/)).toBeVisible();
    await expect(page.locator('[data-testid="create-panel-btn"]')).toBeEnabled();
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
    await expect(page.getByRole('button', { name: /Send/i })).toBeDisabled();
  });

  test('6. full flow: create panel → session → send message → receive cycle', async ({ page }) => {
    const socratesItem = page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' });
    await socratesItem.click();

    await page.locator('[data-testid="panel-name-input"]').fill('Philosophy Panel');
    await page.locator('[data-testid="create-panel-btn"]').click();

    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });

    const chatInput = page.getByPlaceholder(/Ask the panel/i);
    await chatInput.fill('What is justice?');
    await page.getByRole('button', { name: /Send/i }).click();

    await expect(page.getByText('What is justice?')).toBeVisible();

    await expect(page.locator('[data-testid="message-bubble"]').nth(1)).toBeVisible({ timeout: LLM_TIMEOUT });
    await expect(page.locator('[data-testid="message-bubble"]').filter({ hasText: /agreement|disagreement|synthesis/i }).first())
      .toBeVisible({ timeout: LLM_TIMEOUT });
  });

  test('7. streaming shows cursor during generation', async ({ page }) => {
    await page.locator('[data-testid="persona-item"]').first().click();
    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });

    await page.getByPlaceholder(/Ask the panel/i).fill('Tell me something interesting.');
    await page.getByRole('button', { name: /Send/i }).click();

    await expect(page.locator('[data-streaming="true"]')).toBeVisible({ timeout: LLM_TIMEOUT });
    await expect(page.locator('[data-streaming="true"]')).not.toBeVisible({ timeout: LLM_TIMEOUT });
  });

  test('8. @mention routes first expert turn', async ({ page }) => {
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Socrates' }).click();
    await page.locator('[data-testid="persona-item"]').filter({ hasText: 'Mark' }).click();

    await page.locator('[data-testid="create-panel-btn"]').click();
    await expect(page.locator('[data-testid="subtitle"]')).toContainText(/Session:/i, { timeout: 15_000 });

    await page.getByPlaceholder(/Ask the panel/i).fill('@mark-vc What is your investment thesis?');
    await page.getByRole('button', { name: /Send/i }).click();

    await expect(page.locator('[data-testid="message-bubble"][data-author="mark-vc"]').first())
      .toBeVisible({ timeout: LLM_TIMEOUT });
  });

  test('9. admin costs endpoint is accessible', async ({ page }) => {
    const resp = await page.request.get('http://localhost:8000/v1/admin/costs');
    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    expect(json).toHaveProperty('sessions');
    expect(json).toHaveProperty('total_rows');
  });
});
