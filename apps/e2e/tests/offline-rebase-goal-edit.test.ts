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

const createLinkedProject = async (
  page: Page,
  params: { name: string; goalSummary: string }
): Promise<void> => {
  const { name, goalSummary } = params;
  await page.getByRole('tab', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByPlaceholder('Project name').fill(name);
  const dialog = page.getByRole('dialog', { name: 'Create project' });
  await dialog.waitFor({ timeout: 25_000 });
  const goalSelect = dialog
    .getByText('Linked Goal (optional)')
    .locator('..')
    .getByRole('combobox');
  await goalSelect.click();
  await page.getByRole('option', { name: goalSummary }).click();
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(dialog).toBeHidden({ timeout: 25_000 });
  await expect(page.getByText(name, { exact: true })).toBeVisible({
    timeout: 25_000,
  });
};

const setProjectStatus = async (
  page: Page,
  projectName: string,
  status: 'Planned' | 'In progress' | 'Completed' | 'Canceled'
): Promise<void> => {
  const card = page.locator('div.rounded-xl', {
    has: page.getByText(projectName, { exact: true }),
  });
  const trigger = card.getByRole('combobox');

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await trigger.click();
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible({ timeout: 10_000 });
      await listbox
        .getByRole('option', { name: status, exact: true })
        .click({ force: true });
      await expect(trigger).toContainText(status, { timeout: 10_000 });
      return;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      lastError = error;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
  }
  throw lastError ?? new Error('Failed to set project status');
};

const expectGoalAchieved = async (
  page: Page,
  summary: string,
  expected: boolean
): Promise<void> => {
  await page.getByRole('tab', { name: 'Goals' }).click();
  const goalCard = page.locator('div.rounded-xl', {
    has: page.getByText(summary, { exact: true }),
  });
  if (expected) {
    await expect(goalCard.getByText('Achieved')).toBeVisible({
      timeout: 25_000,
    });
  } else {
    await expect(goalCard.getByText('Achieved')).toBeHidden({
      timeout: 25_000,
    });
  }
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

const stopSync = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as { __moSyncStop?: () => void };
    w.__moSyncStop?.();
  });
};

const startSync = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as { __moSyncStart?: () => void };
    w.__moSyncStart?.();
  });
};

const pushOnceOnly = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const w = window as { __moPushOnce?: () => Promise<void> };
    if (w.__moPushOnce) {
      await w.__moPushOnce();
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
  test('offline local edits + online edit + reconnect does not leave stale knownVersion', async () => {
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
      let pushConflicts = 0;
      const recordPushConflict = (url: string, status: number) => {
        if (!url.includes('/sync/push')) return;
        if (status !== 409) return;
        pushConflicts += 1;
      };
      pageA.on('response', (response) => {
        recordPushConflict(response.url(), response.status());
      });
      pageB.on('response', (response) => {
        recordPushConflict(response.url(), response.status());
      });
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
      await pageA.getByRole('button', { name: 'Backup' }).click();
      const backupDialog = pageA.getByRole('dialog', {
        name: 'Backup',
      });
      await backupDialog.waitFor();
      await expect(
        backupDialog.getByRole('button', { name: 'Download keys' })
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
      await pageB
        .locator('input[type="file"][accept*=".backup"]')
        .setInputFiles({
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

      const storeIdA = await pageA.evaluate(() =>
        localStorage.getItem('mo-local-store-id')
      );
      if (!storeIdA || !storeIdB) {
        throw new Error('Missing storeId after cloud connection');
      }
      const headA1 = await pullHead(pageA, storeIdA);
      const headB1 = await pullHead(pageB, storeIdB);
      expect(headA1).toBe(headB1);

      // Device A goes offline and edits locally.
      mark('offline A and edit A1');
      await ctxA.setOffline(true);
      const summaryA1 = `${goalSummary} (A1)`;
      await editGoalSummary(pageA, summaryA1);

      mark('offline A and edit A2');
      const summaryA2 = `${goalSummary} (A2)`;
      await editGoalSummary(pageA, summaryA2);

      // Device B edits online and pushes.
      mark('edit B1');
      const summaryB1 = `${goalSummary} (B1)`;
      await editGoalSummary(pageB, summaryB1);

      // Device A reconnects -> local pending event rebases.
      mark('online A');
      await stopSync(pageA);
      await ctxA.setOffline(false);
      await pushOnceOnly(pageA);
      await startSync(pageA);

      // Give sync a moment to pull/rebase before issuing another update.
      mark('wait for sync settle');
      await pageA.waitForTimeout(2_000);
      await syncOnce(pageA);
      await syncOnce(pageB);

      // This update used to fail with a stale knownVersion mismatch after rebase.
      mark('edit A3');
      const summaryA3 = `${goalSummary} (A3)`;
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await editGoalSummary(pageA, summaryA3);
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
          mark(`retry edit A3 after mismatch (attempt ${attempt})`);
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
      mark('wait for A3 on B');
      await expect(pageB.getByText(summaryA3, { exact: true })).toBeVisible({
        timeout: 25_000,
      });
      await expect(pageA.getByText(summaryA3, { exact: true })).toBeVisible({
        timeout: 25_000,
      });

      mark('edit B2');
      const summaryB2 = `${goalSummary} (B2)`;
      await editGoalSummary(pageB, summaryB2);

      await syncOnce(pageB);
      await syncOnce(pageA);
      await expect(pageA.getByText(summaryB2, { exact: true })).toBeVisible({
        timeout: 25_000,
      });
      await expect(pageB.getByText(summaryB2, { exact: true })).toBeVisible({
        timeout: 25_000,
      });
      const headA2 = await pullHead(pageA, storeIdA);
      const headB2 = await pullHead(pageB, storeIdB);
      expect(headA2).toBe(headB2);
      expect(pushConflicts).toBeGreaterThan(0);

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

  test('rebase reconciliation unachieves goal when a new incomplete project appears', async () => {
    test.setTimeout(180_000);
    const mark = (label: string) => {
      console.log(`[rebase-unachieve] ${label}`);
    };

    const creds: Credentials = {
      email: `sync-${Date.now()}-${randomUUID()}@example.com`,
      password: `Pass-${randomUUID()}-${Date.now()}`,
    };
    const goalSummary = `Goal-${Date.now()}`;
    const projectOne = `Project-${Date.now()}-A`;
    const projectTwo = `Project-${Date.now()}-B`;

    const userDataDirA = test.info().outputPath('profile-a-rebase');
    const userDataDirB = test.info().outputPath('profile-b-rebase');

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

      mark('onboard A');
      await onboard(pageA, creds.password);
      mark('signup cloud A');
      await connectToCloudAsSignup(pageA, creds);
      mark('create goal A');
      await createGoal(pageA, goalSummary);
      mark('sync goal A');
      await syncOnce(pageA);

      mark('backup keys from A');
      await pageA.getByRole('button', { name: 'Backup' }).click();
      const backupDialog = pageA.getByRole('dialog', {
        name: 'Backup',
      });
      await backupDialog.waitFor();
      await backupDialog.getByRole('button', { name: 'Copy' }).click();
      const backupCipher = await pageA.evaluate(async () => {
        return navigator.clipboard.readText();
      });
      await pageA.keyboard.press('Escape');
      await expect(backupDialog).toBeHidden({ timeout: 25_000 });

      mark('restore backup on B');
      await pageB.goto(url('/'));
      await pageB.getByText('Set up your local identity').waitFor({
        timeout: 25_000,
      });
      await pageB
        .locator('input[type="file"][accept*=".backup"]')
        .setInputFiles({
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
      await syncOnce(pageB);
      await expect(pageB.getByText(goalSummary, { exact: true })).toBeVisible({
        timeout: 25_000,
      });

      mark('A creates completed project linked to goal');
      await createLinkedProject(pageA, {
        name: projectOne,
        goalSummary,
      });
      await setProjectStatus(pageA, projectOne, 'Completed');
      await expectGoalAchieved(pageA, goalSummary, true);
      mark('sync achieved state from A');
      await syncOnce(pageA);

      mark('B links incomplete project to goal');
      await createLinkedProject(pageB, {
        name: projectTwo,
        goalSummary,
      });
      await setProjectStatus(pageB, projectTwo, 'In progress');
      await syncOnce(pageB);

      mark('A pulls new project and reconciles');
      await syncOnce(pageA);
      await expectGoalAchieved(pageA, goalSummary, false);
    } finally {
      await ctxA.close();
      await ctxB.close();
      if (errorsA.length > 0) {
        console.error(
          `[rebase-unachieve] console errors A:\\n${errorsA.join('\\n')}`
        );
      }
      if (errorsB.length > 0) {
        console.error(
          `[rebase-unachieve] console errors B:\\n${errorsB.join('\\n')}`
        );
      }
    }
  });
});
