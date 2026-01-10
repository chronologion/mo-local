import { test, expect } from '@playwright/test';
import type { CDPSession } from '@playwright/test';
import { randomUUID } from 'crypto';

test.describe('Passkey enrollment and unlock', () => {
  let cdpSession: CDPSession;

  test.beforeEach(async ({ page, context }) => {
    // Create a virtual authenticator
    cdpSession = await context.newCDPSession(page);
    await cdpSession.send('WebAuthn.enable');
    await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });

    // Mock WebAuthn PRF extension support (virtual authenticator doesn't support PRF)
    await page.addInitScript(() => {
      const originalCreate = navigator.credentials.create.bind(navigator.credentials);
      const originalGet = navigator.credentials.get.bind(navigator.credentials);

      // Store PRF outputs in sessionStorage to persist across page reloads
      const getPrfOutputs = (): Record<string, number[]> => {
        const stored = sessionStorage.getItem('__test_prf_outputs');
        return stored ? JSON.parse(stored) : {};
      };

      const setPrfOutputs = (outputs: Record<string, number[]>) => {
        sessionStorage.setItem('__test_prf_outputs', JSON.stringify(outputs));
      };

      const generatePrfOutput = (credentialId: ArrayBuffer): ArrayBuffer => {
        const key = Array.from(new Uint8Array(credentialId)).join(',');
        const outputs = getPrfOutputs();

        if (!outputs[key]) {
          const newOutput = new Uint8Array(32);
          crypto.getRandomValues(newOutput);
          outputs[key] = Array.from(newOutput);
          setPrfOutputs(outputs);
        }

        return new Uint8Array(outputs[key]).buffer;
      };

      navigator.credentials.create = async function (options: CredentialCreationOptions) {
        const result = await originalCreate(options);
        if (result && 'getClientExtensionResults' in result && 'rawId' in result) {
          const originalGetResults = result.getClientExtensionResults.bind(result);
          const credentialId = (result as PublicKeyCredential).rawId;
          result.getClientExtensionResults = function () {
            const extensions = originalGetResults();
            // Add PRF output to extension results
            return {
              ...extensions,
              prf: {
                results: {
                  first: generatePrfOutput(credentialId),
                },
              },
            };
          };
        }
        return result;
      };

      navigator.credentials.get = async function (options: CredentialRequestOptions) {
        const result = await originalGet(options);
        if (result && 'getClientExtensionResults' in result && 'rawId' in result) {
          const originalGetResults = result.getClientExtensionResults.bind(result);
          const credentialId = (result as PublicKeyCredential).rawId;
          result.getClientExtensionResults = function () {
            const extensions = originalGetResults();
            // Add PRF output to extension results
            return {
              ...extensions,
              prf: {
                results: {
                  first: generatePrfOutput(credentialId),
                },
              },
            };
          };
        }
        return result;
      };
    });
  });

  test.afterEach(async () => {
    if (cdpSession) {
      await cdpSession.send('WebAuthn.disable');
    }
  });

  test('should enroll passkey during onboarding with checkbox', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding with passkey checkbox enabled
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);

    // Enable passkey checkbox
    const passkeyCheckbox = page.getByLabel(/Enable passkey unlock/i);
    await expect(passkeyCheckbox).toBeVisible();
    await passkeyCheckbox.check();

    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    // Wait for onboarding to complete
    const loadingIdentity = page.getByText('Loading identity…');
    await loadingIdentity.waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => undefined);

    // Verify we're at the main app (no modal should appear)
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible();
  });

  test('should unlock with passkey after enrollment', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding with passkey enabled
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    await page.getByLabel(/Enable passkey unlock/i).check();
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    // Wait for onboarding to complete and app to be ready
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 25_000 });

    // Force lock by reloading the page
    await page.reload();

    // Should show unlock screen
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });

    // Passkey unlock button should be visible
    const passkeyUnlockButton = page.getByRole('button', { name: /Unlock with Passkey/i });
    await passkeyUnlockButton.waitFor({ timeout: 5_000 });
    await expect(passkeyUnlockButton).toBeVisible();

    // Verify passphrase option is also available
    await expect(page.getByText('Or use passphrase')).toBeVisible();
    await expect(page.getByLabel('Passphrase')).toBeVisible();

    // Unlock with passkey
    await passkeyUnlockButton.click();

    // Should unlock successfully
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 10_000 });
  });

  test('should fallback to passphrase when passkey is available', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding with passkey enabled
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    await page.getByLabel(/Enable passkey unlock/i).check();
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    // Wait for onboarding to complete and app to be ready
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 25_000 });

    // Force lock by reloading
    await page.reload();
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });

    // Use passphrase instead of passkey
    await page.getByLabel('Passphrase').fill(password);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();

    // Should unlock successfully
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 10_000 });
  });

  test('should allow passkey enrollment on unlock screen', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding WITHOUT enabling passkey
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    // Don't check the passkey checkbox
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    // Wait for onboarding to complete and app to be ready
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 25_000 });

    // Force lock by reloading
    await page.reload();
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });

    // Passkey unlock button should NOT be visible yet
    const passkeyUnlockButton = page.getByRole('button', { name: /Unlock with Passkey/i });
    await expect(passkeyUnlockButton).not.toBeVisible();

    // Checkbox to enable passkey should be visible on unlock screen
    const passkeyCheckbox = page.getByLabel(/Enable passkey unlock/i);
    await expect(passkeyCheckbox).toBeVisible();
    await passkeyCheckbox.check();

    // Unlock with passphrase and enable passkey
    await page.getByLabel('Passphrase').fill(password);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();

    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 10_000 });

    // Lock again and verify passkey is now available
    await page.reload();
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Unlock with Passkey/i })).toBeVisible();
  });

  test('should work without passkey when checkbox not checked', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding WITHOUT checking passkey checkbox
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    // Verify checkbox is visible but don't check it
    await expect(page.getByLabel(/Enable passkey unlock/i)).toBeVisible();
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    const loadingIdentity = page.getByText('Loading identity…');
    await loadingIdentity.waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => undefined);

    // Should go to main app without passkey enrolled
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible();

    // Force lock by reloading
    await page.reload();
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });

    // Passkey unlock button should NOT be available
    await expect(page.getByRole('button', { name: /Unlock with Passkey/i })).not.toBeVisible();

    // Only passphrase unlock available
    await page.getByLabel('Passphrase').fill(password);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 10_000 });
  });

  test('should not require passkey enrollment to use the app', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    await page.goto('/');

    // Complete onboarding WITHOUT passkey
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);
    // Don't check passkey checkbox
    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    // Should complete onboarding successfully without passkey
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 25_000 });

    // Lock and verify passkey is NOT available
    await page.reload();
    await page.getByText('Welcome back').waitFor({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Unlock with Passkey/i })).not.toBeVisible();

    // Can unlock with passphrase
    await page.getByLabel('Passphrase').fill(password);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Passkey on unsupported browser', () => {
  test('should not show passkey checkbox when WebAuthn not supported', async ({ page }) => {
    const password = `Test-${randomUUID()}-${Date.now()}`;

    // Mock WebAuthn as unsupported
    await page.addInitScript(() => {
      // @ts-expect-error - Intentionally breaking WebAuthn for test
      delete window.PublicKeyCredential;
    });

    await page.goto('/');

    // Complete onboarding
    await page.getByText('Set up your local identity').waitFor();
    await page.getByPlaceholder('Create a passphrase').fill(password);
    await page.getByPlaceholder('Repeat passphrase').fill(password);

    // Passkey checkbox should NOT be visible
    await expect(page.getByLabel(/Enable passkey unlock/i)).not.toBeVisible();

    await page.getByRole('button', { name: 'Finish onboarding' }).click();

    const loadingIdentity = page.getByText('Loading identity…');
    await loadingIdentity.waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => undefined);

    // Should go straight to main app
    await expect(page.getByRole('tab', { name: 'Goals' })).toBeVisible();
  });
});
