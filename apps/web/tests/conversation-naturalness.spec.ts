import { expect, test, type Page } from '@playwright/test';

async function createPanelAndSession() {
  return {
    panelName: 'Naturalness UAT Panel',
    personas: 'shark_1,founder_1,mediator_1',
  };
}

async function getAuthorTimeline(page: Page) {
  return page.locator('[data-testid="message-bubble"]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.author || '')
  );
}

test.describe('Conversational look-and-feel UAT', () => {
  test('feels responsive and preserves natural turn-taking including @mention direction', async ({ page }) => {
    const cfg = await createPanelAndSession();

    await page.goto('/');
    await page.getByPlaceholder('Panel name').fill(cfg.panelName);
    await page.getByPlaceholder('comma-separated persona IDs').fill(cfg.personas);
    await page.getByRole('button', { name: 'Create Panel' }).click();

    await expect(page.getByText(/Session:/)).toBeVisible();

    const firstPrompt = 'What is the single biggest risk in this plan?';
    await page.getByPlaceholder('Ask the panel. Use @persona_id to target someone.').fill(firstPrompt);

    const tUser1Start = Date.now();
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.locator('[data-testid="message-content"]').filter({ hasText: firstPrompt })).toBeVisible();
    const user1EchoMs = Date.now() - tUser1Start;

    await expect
      .poll(async () => (await page.locator('[data-testid="mediator-status"]').textContent()) || '')
      .toContain('evaluating');

    await expect
      .poll(async () => await page.locator('[data-testid="agent-status"][data-status="typing"]').count())
      .toBeGreaterThan(0);

    await expect
      .poll(async () => await page.locator('[data-testid="message-bubble"][data-streaming="true"]').count())
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const authors = await getAuthorTimeline(page);
        return authors.filter((a) => a !== 'user').length;
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => await page.locator('[data-testid="message-bubble"][data-streaming="true"]').count())
      .toBe(0);

    const assistant1Ms = Date.now() - tUser1Start;

    const secondPrompt = '@founder_1 Give a concise rebuttal to the previous point.';
    await page.getByPlaceholder('Ask the panel. Use @persona_id to target someone.').fill(secondPrompt);
    const tUser2Start = Date.now();
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.locator('[data-testid="message-content"]').filter({ hasText: secondPrompt })).toBeVisible();
    const user2EchoMs = Date.now() - tUser2Start;

    await expect
      .poll(async () => {
        const authors = await getAuthorTimeline(page);
        return authors[authors.length - 1] || '';
      })
      .toBe('founder_1');

    const assistant2Ms = Date.now() - tUser2Start;

    await expect
      .poll(async () => await page.locator('[data-testid="message-bubble"][data-streaming="true"]').count())
      .toBe(0);
    await expect(page.getByTestId('agent-status-empty')).toBeVisible();

    const authors = await getAuthorTimeline(page);

    expect(user1EchoMs).toBeLessThan(1000);
    expect(user2EchoMs).toBeLessThan(1000);
    expect(assistant1Ms).toBeLessThan(8000);
    expect(assistant2Ms).toBeLessThan(8000);

    // Conversation should feel naturally turn-based, and @mention should steer speaker.
    expect(authors.filter((a) => a === 'user').length).toBeGreaterThanOrEqual(2);
    expect(authors.includes('shark_1')).toBeTruthy();
    expect(authors[authors.length - 1]).toBe('founder_1');
  });
});
