import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

type OnboardResult = {
  storeId: string;
};

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:4000';

async function onboardAndConnect(page: Page): Promise<OnboardResult> {
  const password = `Pass-${randomUUID()}-${Date.now()}`;
  const storeId = `store-${Date.now()}-${randomUUID()}`;

  await page.addInitScript(([sid]) => {
    localStorage.setItem('mo-local-store-id', sid);
  }, [storeId]);
  await page.goto('/');

  await page.getByText('Set up your local identity').waitFor();
  await page.getByPlaceholder('Create a passphrase').fill(password);
  await page.getByPlaceholder('Repeat passphrase').fill(password);
  await page.getByRole('button', { name: 'Finish onboarding' }).click();

  const unlockButton = page.getByRole('button', { name: 'Unlock' });
  const connectButton = page.getByRole('button', {
    name: 'Connect to cloud',
  });
  await Promise.race([
    connectButton.waitFor({ timeout: 25_000 }),
    unlockButton.waitFor({ timeout: 25_000 }),
  ]);

  if (await unlockButton.isVisible()) {
    await page.getByRole('textbox').fill(password);
    await unlockButton.click();
    await connectButton.waitFor({ timeout: 25_000 });
  }

  const email = `sync-${Date.now()}-${randomUUID()}@example.com`;
  await connectButton.click();
  const dialog = page.getByRole('dialog', { name: 'Create account' });
  await dialog.getByPlaceholder('you@example.com').waitFor();
  await dialog.getByPlaceholder('you@example.com').fill(email);
  await dialog.getByPlaceholder('Enter a strong password').fill(password);
  await dialog.getByRole('button', { name: 'Create account' }).click();

  await page.getByText('Connected').waitFor({ timeout: 15_000 });

  return { storeId };
}

async function pushEvents(
  page: Page,
  payload: unknown
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ apiBase, body }) => {
      const resp = await fetch(`${apiBase}/sync/push`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
      return { status: resp.status, body: data };
    },
    { apiBase: API_BASE, body: payload }
  );
}

async function pullEvents(page: Page, storeId: string) {
  return page.evaluate(
    async ({ apiBase, sid }) => {
      const resp = await fetch(
        `${apiBase}/sync/pull?storeId=${encodeURIComponent(sid)}&since=0&limit=100`,
        { credentials: 'include' }
      );
      const data = (await resp.json()) as {
        events: Array<{ seqNum: number; parentSeqNum: number; name: string }>;
        headSeqNum: number;
      };
      return data;
    },
    { apiBase: API_BASE, sid: storeId }
  );
}

test.describe('Sync conflicts rebased via LiveStore', () => {
  test.setTimeout(30_000);

  test('server-ahead conflict surfaces and sync recovers', async ({ page }) => {
    const { storeId } = await onboardAndConnect(page);

    expect(storeId).not.toBe('');

    // Pull to find current head
    const initial = await pullEvents(page, storeId);
    const head = initial.headSeqNum ?? 0;

    // Seed head with next seqNum
    const firstSeq = head + 1;
    const first = await pushEvents(page, {
      storeId,
      events: [
        {
          name: 'project.created',
          args: { id: 'alpha', name: 'Alpha' },
          seqNum: firstSeq,
          parentSeqNum: head,
          clientId: 'client-test',
          sessionId: 'session-test',
        },
      ],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // Push stale seqNum 1 again -> expect ServerAheadError
    const conflict = await pushEvents(page, {
      storeId,
      events: [
        {
          name: 'project.created',
          args: { id: 'dup', name: 'Dup' },
          seqNum: firstSeq,
          parentSeqNum: head,
          clientId: 'client-test',
          sessionId: 'session-test',
        },
      ],
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body?.minimumExpectedSeqNum).toBeDefined();
    expect(conflict.body?.providedSeqNum).toBeDefined();

    // Push next seqNum to ensure sync still works
    const nextSeq = firstSeq + 1;
    const second = await pushEvents(page, {
      storeId,
      events: [
        {
          name: 'project.created',
          args: { id: 'beta', name: 'Beta' },
          seqNum: nextSeq,
          parentSeqNum: firstSeq,
          clientId: 'client-test',
          sessionId: 'session-test',
        },
      ],
    });
    expect(second.status).toBe(201);

    // Pull to verify ordering and uniqueness
    const pulled = await pullEvents(page, storeId);
    const seqNums = pulled.events.map((e) => e.seqNum);
    expect(new Set(seqNums).size).toBe(seqNums.length);
    expect(seqNums).toContain(firstSeq);
    expect(seqNums).toContain(nextSeq);
  });
});
