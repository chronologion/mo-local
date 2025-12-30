import { test, expect, chromium, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:4000';

type Credentials = Readonly<{ email: string; password: string }>;

const url = (path: string): string => new URL(path, BASE_URL).toString();

const attachConsoleErrorTrap = (page: Page, bucket: string[]): void => {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    bucket.push(msg.text());
  });
  page.on('pageerror', (error) => {
    bucket.push(error.message);
  });
};

const onboard = async (page: Page, password: string): Promise<void> => {
  await page.goto(url('/'));

  await page.getByText('Set up your local identity').waitFor({
    timeout: 25_000,
  });
  await page.getByPlaceholder('Create a passphrase').fill(password);
  await page.getByPlaceholder('Repeat passphrase').fill(password);
  await page.getByRole('button', { name: 'Finish onboarding' }).click();

  const unlockButton = page.getByRole('button', { name: 'Unlock' });
  await unlockButton.waitFor({ state: 'hidden' }).catch(() => undefined);
};

const connectToCloudAsSignup = async (
  page: Page,
  creds: Credentials
): Promise<void> => {
  await page.getByRole('button', { name: 'Connect to cloud' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('you@example.com').waitFor({ timeout: 25_000 });
  await dialog.getByPlaceholder('you@example.com').fill(creds.email);
  await dialog.getByPlaceholder('Enter a strong password').fill(creds.password);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Connected').waitFor({ timeout: 25_000 });
};

const connectToCloudAsLogin = async (
  page: Page,
  creds: Credentials
): Promise<void> => {
  await page.getByRole('button', { name: 'Connect to cloud' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 25_000 });
  await dialog.getByRole('tab', { name: 'Log in' }).click();
  await dialog.getByPlaceholder('you@example.com').fill(creds.email);
  await dialog.getByPlaceholder('Enter your password').fill(creds.password);
  await dialog.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Connected').waitFor({ timeout: 25_000 });
};

const createGoal = async (page: Page, summary: string): Promise<void> => {
  await page.getByRole('tab', { name: 'Goals' }).waitFor({ timeout: 25_000 });
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.getByPlaceholder('Define a concrete goal').fill(summary);
  await page.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByText(summary, { exact: true })).toBeVisible({
    timeout: 25_000,
  });
};

const editGoalSummary = async (
  page: Page,
  nextSummary: string
): Promise<void> => {
  await page
    .getByRole('tab', { name: 'Goals' })
    .click()
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Edit goal' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Edit goal' });
  await dialog.waitFor({ timeout: 25_000 });
  await dialog.getByPlaceholder('Define a concrete goal').fill(nextSummary);
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  const errorText = dialog.locator('.text-destructive').first();
  const outcome = await Promise.race([
    dialog.waitFor({ state: 'hidden', timeout: 25_000 }).then(() => ({
      ok: true as const,
    })),
    errorText.waitFor({ state: 'visible', timeout: 25_000 }).then(() => ({
      ok: false as const,
    })),
  ]);
  if (!outcome.ok) {
    const message = (await errorText.textContent())?.trim();
    throw new Error(message ?? 'Goal update failed');
  }
  await expect(page.getByText(nextSummary, { exact: true })).toBeVisible({
    timeout: 25_000,
  });
};

const syncOnce = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const w = window as { __moSyncOnce?: () => Promise<void> };
    if (w.__moSyncOnce) {
      await w.__moSyncOnce();
    }
  });
};

const getPendingCount = async (page: Page): Promise<number | null> => {
  return await page.evaluate(async () => {
    const w = window as { __moPendingCount?: () => Promise<number> };
    if (w.__moPendingCount) {
      return await w.__moPendingCount();
    }
    return null;
  });
};

const getSyncStatus = async (page: Page): Promise<unknown> => {
  return await page.evaluate(() => {
    const w = window as { __moSyncStatus?: () => unknown };
    return w.__moSyncStatus ? w.__moSyncStatus() : null;
  });
};

const pullHead = async (page: Page, storeId: string): Promise<number> => {
  return await page.evaluate(
    async ({ apiBase, sid }) => {
      const resp = await fetch(
        `${apiBase}/sync/pull?storeId=${encodeURIComponent(sid)}&since=0&limit=1`,
        { credentials: 'include' }
      );
      const data = (await resp.json()) as { head: number };
      return data.head ?? 0;
    },
    { apiBase: API_BASE, sid: storeId }
  );
};

test.describe('offline rebase goal edit', () => {
  test('offline local edit + online edit + reconnect does not leave stale knownVersion', async () => {
    test.setTimeout(180_000);
    const mark = (label: string) => {
      console.log(`[offline-rebase] ${label}`);
    };

    const creds: Credentials = {
      email: `sync-${Date.now()}-${randomUUID()}@example.com`,
      password: `Pass-${randomUUID()}-${Date.now()}`,
    };
    const goalSummary = `Goal-${Date.now()}`;

    const userDataDirA = test.info().outputPath('profile-a');
    const userDataDirB = test.info().outputPath('profile-b');

    const ctxA = await chromium.launchPersistentContext(userDataDirA, {
      acceptDownloads: true,
      viewport: { width: 1280, height: 720 },
    });
    const ctxB = await chromium.launchPersistentContext(userDataDirB, {
      acceptDownloads: true,
      viewport: { width: 1280, height: 720 },
    });

    const errorsA: string[] = [];
    const errorsB: string[] = [];

    try {
      mark('creating pages');
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      attachConsoleErrorTrap(pageA, errorsA);
      attachConsoleErrorTrap(pageB, errorsB);
      await ctxA.grantPermissions(['clipboard-read', 'clipboard-write']);
      pageA.setDefaultTimeout(25_000);
      pageB.setDefaultTimeout(25_000);
      pageA.setDefaultNavigationTimeout(25_000);
      pageB.setDefaultNavigationTimeout(25_000);

      mark('onboard A');
      await onboard(pageA, creds.password);
      mark('signup cloud A');
      await connectToCloudAsSignup(pageA, creds);
      mark('create goal A');
      await createGoal(pageA, goalSummary);
      mark('sync push from A');
      await syncOnce(pageA);
      const pendingAfterPush = await getPendingCount(pageA);
      if (pendingAfterPush !== null) {
        mark(`pending events after push A: ${pendingAfterPush}`);
      }
      const statusAfterPush = await getSyncStatus(pageA);
      if (statusAfterPush) {
        mark(`sync status after push A: ${JSON.stringify(statusAfterPush)}`);
      }

      mark('open backup modal A');
      await pageA.getByRole('button', { name: 'Backup keys' }).click();
      const backupDialog = pageA.getByRole('dialog', {
        name: 'Backup identity keys (not goal data)',
      });
      await backupDialog.waitFor();
      await expect(
        backupDialog.getByRole('button', { name: 'Download .json' })
      ).toBeEnabled({ timeout: 25_000 });

      mark('copy backup payload');
      await backupDialog.getByRole('button', { name: 'Copy' }).click();
      const backupCipher = await pageA.evaluate(async () => {
        return navigator.clipboard.readText();
      });
      mark(`backup payload length=${backupCipher.length}`);
      await pageA.keyboard.press('Escape');
      await expect(backupDialog).toBeHidden({ timeout: 25_000 });

      mark('restore backup on B');
      await pageB.goto(url('/'));
      await pageB.getByText('Set up your local identity').waitFor({
        timeout: 25_000,
      });
      await pageB.locator('input[type="file"]').setInputFiles({
        name: `mo-local-backup-${Date.now()}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(backupCipher, 'utf8'),
      });
      await pageB
        .getByPlaceholder('Passphrase used for backup')
        .fill(creds.password);
      await pageB.getByRole('button', { name: 'Restore backup' }).click();
      await pageB.getByRole('tab', { name: 'Goals' }).waitFor({
        timeout: 25_000,
      });

      mark('login cloud on B');
      await connectToCloudAsLogin(pageB, creds);
      const storeIdB = await pageB.evaluate(() =>
        localStorage.getItem('mo-local-store-id')
      );
      if (storeIdB) {
        const head = await pullHead(pageB, storeIdB);
        mark(`server head after login B: ${head}`);
      }
      mark('sync push from A (post-login)');
      await syncOnce(pageA);
      mark('sync pull on B');
      await syncOnce(pageB);

      // Wait for initial sync onto device B (retry with explicit sync).
      mark('wait for goal on B');
      let synced = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await expect(
            pageB.getByText(goalSummary, { exact: true })
          ).toBeVisible({
            timeout: 10_000,
          });
          synced = true;
          break;
        } catch {
          mark(`retry sync on B (attempt ${attempt})`);
          await syncOnce(pageA);
          await syncOnce(pageB);
          await pageB.waitForTimeout(1_000);
        }
      }
      if (!synced) {
        throw new Error('Goal did not sync to device B');
      }

      // Device A goes offline and edits locally.
      mark('offline A and edit A1');
      await ctxA.setOffline(true);
      const summaryA1 = `${goalSummary} (A1)`;
      await editGoalSummary(pageA, summaryA1);

      // Device B edits online and pushes.
      mark('edit B1');
      const summaryB1 = `${goalSummary} (B1)`;
      await editGoalSummary(pageB, summaryB1);

      // Device A reconnects -> local pending event rebases.
      mark('online A');
      await ctxA.setOffline(false);

      // Give sync a moment to pull/rebase before issuing another update.
      mark('wait for sync settle');
      await pageA.waitForTimeout(2_000);

      // This update used to fail with a stale knownVersion mismatch after rebase.
      mark('edit A2');
      const summaryA2 = `${goalSummary} (A2)`;
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await editGoalSummary(pageA, summaryA2);
          lastError = null;
          break;
        } catch (error) {
          if (!(error instanceof Error)) {
            throw error;
          }
          lastError = error;
          if (!error.message.toLowerCase().includes('version mismatch')) {
            throw error;
          }
          mark(`retry edit A2 after mismatch (attempt ${attempt})`);
          await pageA.keyboard.press('Escape');
          await pageA
            .getByRole('dialog', { name: 'Edit goal' })
            .waitFor({ state: 'hidden', timeout: 25_000 })
            .catch(() => undefined);
          await pageA.waitForTimeout(1_000);
        }
      }
      if (lastError) {
        throw lastError;
      }

      // Device B receives A's rebased edit and should be able to keep editing.
      mark('wait for A2 on B');
      await expect(pageB.getByText(summaryA2, { exact: true })).toBeVisible({
        timeout: 25_000,
      });

      mark('edit B2');
      const summaryB2 = `${goalSummary} (B2)`;
      await editGoalSummary(pageB, summaryB2);

      mark('assert no version mismatch errors');
      expect(
        [...errorsA, ...errorsB].filter((msg) =>
          msg.toLowerCase().includes('version mismatch')
        )
      ).toEqual([]);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
