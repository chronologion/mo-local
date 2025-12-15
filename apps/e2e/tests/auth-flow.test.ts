import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

test.describe('Kratos auth flow', () => {
  test('signup, connect, /me, logout', async ({ page }) => {
    const email = `poc-${Date.now()}-${randomUUID()}@example.com`;
    const password = `S!gnUp-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    const loadingIdentity = page.getByText('Loading identity…');
    await loadingIdentity
      .waitFor({ state: 'hidden', timeout: 25_000 })
      .catch(() => undefined);

    const unlockButton = page.getByRole('button', { name: 'Unlock' });
    const connectButton = page.getByRole('button', { name: 'Connect to cloud' });
    await Promise.race([
      connectButton.waitFor({ timeout: 25_000 }),
      unlockButton.waitFor({ timeout: 25_000 }),
    ]);

    if (await unlockButton.isVisible()) {
      await page.getByRole('textbox').fill(password);
      await unlockButton.click();
      await connectButton.waitFor({ timeout: 25_000 });
    }

    await connectButton.click();

    const dialog = page.getByRole('dialog', { name: 'Create account' });
    await dialog.getByPlaceholder('you@example.com').waitFor();
    await dialog.getByPlaceholder('you@example.com').fill(email);
    await dialog.getByPlaceholder('Enter a strong password').fill(password);
    await dialog.getByRole('button', { name: 'Create account' }).click();

    await page.getByText('Connected').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Logout' }).waitFor({
      timeout: 10_000,
    });

    const me = await page.evaluate(async () => {
      const response = await fetch('http://localhost:4000/me', {
        credentials: 'include',
      });
      const body = (await response.json()) as unknown;
      return { ok: response.ok, body };
    });
    expect(me.ok).toBe(true);
    expect(me.body).toMatchObject({
      id: expect.any(String),
      traits: { email },
    });

    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('button', { name: 'Connect to cloud' }).waitFor();
  });
});
