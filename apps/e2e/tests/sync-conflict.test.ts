import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';

type OnboardResult = {
  storeId: string;
  actorId: string;
};

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:4000';

async function onboardAndConnect(page: Page): Promise<OnboardResult> {
  const password = `Pass-${randomUUID()}-${Date.now()}`;
  await page.goto('/');

  await page.getByText('Set up your local identity').waitFor();
  await page.getByPlaceholder('Create a passphrase').fill(password);
  await page.getByPlaceholder('Repeat passphrase').fill(password);
  await page.getByRole('button', { name: 'Finish onboarding' }).click();

  const unlockButton = page.getByRole('button', { name: 'Unlock' });
  const connectButton = page.getByRole('button', {
    name: 'Connect to cloud',
  });
  await Promise.race([connectButton.waitFor({ timeout: 25_000 }), unlockButton.waitFor({ timeout: 25_000 })]);

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

  const resolvedStoreId = await page.evaluate(() => {
    return localStorage.getItem('mo-local-store-id') ?? '';
  });

  const actorId = await page.evaluate(() => {
    const raw = localStorage.getItem('mo-local-user');
    if (!raw) return '';
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'userId' in parsed &&
        typeof (parsed as { userId?: unknown }).userId === 'string'
      ) {
        return (parsed as { userId: string }).userId;
      }
      return '';
    } catch {
      return '';
    }
  });

  return { storeId: resolvedStoreId, actorId };
}

const encodeBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

type RecordJsonParams = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
  actorId: string;
};

const makeRecordJson = (params: RecordJsonParams): string =>
  JSON.stringify({
    id: params.id,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType,
    payload: encodeBase64Url(params.payload),
    version: params.version,
    occurredAt: params.occurredAt,
    actorId: params.actorId,
    causationId: null,
    correlationId: null,
    epoch: null,
    keyringUpdate: null,
  });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getReason = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  const reason = value.reason;
  return typeof reason === 'string' ? reason : undefined;
};

const getHead = (value: unknown): number | null => {
  if (!isRecord(value)) return null;
  const head = value.head;
  return typeof head === 'number' ? head : null;
};

const getSyncStatusKind = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  return typeof kind === 'string' ? kind : null;
};

const getSyncStatusReason = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  const error = value.error;
  if (!isRecord(error)) return null;
  const context = error.context;
  if (!isRecord(context)) return null;
  const reason = context.reason;
  return typeof reason === 'string' ? reason : null;
};

async function pushEvents(page: Page, payload: unknown): Promise<{ status: number; body: unknown }> {
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

async function resetServerStore(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    async ({ apiBase, sid }) => {
      const resp = await fetch(`${apiBase}/sync/dev/reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId: sid }),
      });
      if (!resp.ok) {
        throw new Error(`reset failed: ${resp.status}`);
      }
    },
    { apiBase: API_BASE, sid: storeId }
  );
}

async function pullEvents(page: Page, storeId: string) {
  return page.evaluate(
    async ({ apiBase, sid }) => {
      const resp = await fetch(`${apiBase}/sync/pull?storeId=${encodeURIComponent(sid)}&since=0&limit=100`, {
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        events: Array<{
          globalSequence: number;
          eventId: string;
          recordJson: string;
        }>;
        head: number;
        hasMore: boolean;
        nextSince: number | null;
      };
      return data;
    },
    { apiBase: API_BASE, sid: storeId }
  );
}

const syncOnce = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await (window as { __moSyncOnce?: () => Promise<void> }).__moSyncOnce?.();
  });
};

const pushOnce = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await (window as { __moPushOnce?: () => Promise<void> }).__moPushOnce?.();
  });
};

const resetSyncState = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await (window as { __moResetSyncState?: () => Promise<void> }).__moResetSyncState?.();
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
  return page.evaluate(() => (window as { __moSyncStatus?: () => unknown }).__moSyncStatus?.());
};

test.describe('Sync conflicts rebased via sync protocol', () => {
  test.setTimeout(30_000);

  test('server-ahead conflict surfaces and sync recovers', async ({ page }) => {
    const { storeId, actorId } = await onboardAndConnect(page);

    expect(storeId).not.toBe('');
    expect(actorId).not.toBe('');
    expect(storeId).toBe(actorId);

    // Pull to find current head
    const initial = await pullEvents(page, storeId);
    const head = initial.head ?? 0;
    const aggregateId = randomUUID();
    const now = Date.now();
    const first = await pushEvents(page, {
      storeId,
      expectedHead: head,
      events: [
        {
          eventId: randomUUID(),
          recordJson: makeRecordJson({
            id: randomUUID(),
            aggregateType: 'project',
            aggregateId,
            eventType: 'ProjectCreated',
            version: 1,
            occurredAt: now,
            actorId,
            payload: new Uint8Array([1, 2, 3]),
          }),
        },
      ],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // Push stale expectedHead again -> expect server ahead conflict
    const conflict = await pushEvents(page, {
      storeId,
      expectedHead: head,
      events: [
        {
          eventId: randomUUID(),
          recordJson: makeRecordJson({
            id: randomUUID(),
            aggregateType: 'project',
            aggregateId,
            eventType: 'ProjectCreated',
            version: 2,
            occurredAt: now + 1,
            actorId,
            payload: new Uint8Array([4, 5, 6]),
          }),
        },
      ],
    });
    expect(conflict.status, JSON.stringify(conflict.body)).toBe(409);
    expect(getReason(conflict.body)).toBe('server_ahead');

    // Push next with updated head to ensure sync still works
    const nextHead = getHead(conflict.body) ?? head + 1;
    const second = await pushEvents(page, {
      storeId,
      expectedHead: nextHead,
      events: [
        {
          eventId: randomUUID(),
          recordJson: makeRecordJson({
            id: randomUUID(),
            aggregateType: 'project',
            aggregateId,
            eventType: 'ProjectRenamed',
            version: 3,
            occurredAt: now + 2,
            actorId,
            payload: new Uint8Array([7, 8, 9]),
          }),
        },
      ],
    });
    expect(second.status).toBe(201);

    // Pull to verify ordering and uniqueness
    const pulled = await pullEvents(page, storeId);
    const globalSeqs = pulled.events.map((e) => e.globalSequence);
    expect(new Set(globalSeqs).size).toBe(globalSeqs.length);
    expect(globalSeqs).toContain(nextHead);
    expect(globalSeqs).toContain(nextHead + 1);
  });

  test('server reset requires local sync reset to re-push', async ({ page }) => {
    const { storeId } = await onboardAndConnect(page);

    await page.getByRole('tab', { name: 'Goals' }).waitFor({ timeout: 25_000 });
    await page.getByRole('button', { name: 'New goal' }).click();
    await page.getByPlaceholder('Define a concrete goal').fill('Goal A');
    await page.getByRole('button', { name: 'Create goal' }).click();
    await expect(page.getByText('Goal A', { exact: true })).toBeVisible({ timeout: 25_000 });

    await expect.poll(async () => (await getPendingCount(page)) ?? 0).toBeGreaterThan(0);
    await pushOnce(page);
    await expect
      .poll(async () => {
        const beforeReset = await pullEvents(page, storeId);
        return beforeReset.head ?? 0;
      })
      .toBeGreaterThan(0);

    await resetServerStore(page, storeId);

    await page.getByRole('button', { name: 'New goal' }).click();
    await page.getByPlaceholder('Define a concrete goal').fill('Goal B');
    await page.getByRole('button', { name: 'Create goal' }).click();
    await expect(page.getByText('Goal B', { exact: true })).toBeVisible({ timeout: 25_000 });

    await pushOnce(page);
    await expect.poll(async () => getSyncStatusKind(await getSyncStatus(page))).toBe('error');
    const statusAfterConflict = await getSyncStatus(page);
    expect(getSyncStatusReason(statusAfterConflict)).toBe('server_behind');

    await resetSyncState(page);
    await syncOnce(page);

    const afterReset = await pullEvents(page, storeId);
    expect(afterReset.head).toBeGreaterThanOrEqual(2);
    expect(afterReset.events.length).toBeGreaterThanOrEqual(2);
  });
});
