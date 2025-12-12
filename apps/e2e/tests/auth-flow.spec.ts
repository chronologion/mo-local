import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

test.describe('Kratos auth flow', () => {
  test('signup, connect, /me, logout', async ({ page, request }) => {
    const email = `poc-${Date.now()}-${randomUUID()}@example.com`;
    const password = `S!gnUp-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    await page.getByText('Goals (offline)').waitFor({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Connect to cloud' }).click();

    await page.getByPlaceholder('you@example.com').waitFor();
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('Min 8 characters').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.getByText('Connected').waitFor({ timeout: 10_000 });

    const sessionToken = await page.evaluate(() =>
      localStorage.getItem('mo-remote-session-token')
    );
    expect(sessionToken).toBeTruthy();

    const meResponse = await request.fetch('http://localhost:4000/me', {
      headers: {
        'x-session-token': sessionToken ?? '',
      },
    });
    expect(meResponse.ok()).toBeTruthy();
    const meJson = await meResponse.json();
    expect(meJson).toMatchObject({
      id: expect.any(String),
      traits: { email },
    });

    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('button', { name: 'Connect to cloud' }).waitFor();
  });
});
