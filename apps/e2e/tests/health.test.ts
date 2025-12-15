import { test, expect, request } from '@playwright/test';

test.describe('stack health', () => {
  test('api and kratos are reachable', async ({ page, baseURL }) => {
    const apiContext = await request.newContext();
    const apiHealth = await apiContext.get('http://localhost:4000/health');
    expect(apiHealth.ok()).toBeTruthy();
    const apiJson = await apiHealth.json();
    expect(apiJson).toMatchObject({ status: 'ok', db: true });

    const kratosContext = await request.newContext();
    const kratosReady = await kratosContext.get(
      'http://localhost:4455/health/ready'
    );
    expect(kratosReady.ok()).toBeTruthy();

    // Simple web reachability check (page load) to ensure Vite dev server is up
    await page.goto(baseURL ?? 'http://localhost:5173');
    expect(await page.title()).not.toBe('');
  });
});
