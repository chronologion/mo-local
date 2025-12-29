import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/client', () => {
  return {
    DbClient: class {
      shutdown(): void {}
    },
    sendHello: vi.fn().mockResolvedValue({}),
  };
});

import { createWebSqliteDb } from '../src/index';
import { sendHello } from '../src/client';

describe('createWebSqliteDb', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalSharedWorker = globalThis.SharedWorker;
  const originalWorker = globalThis.Worker;
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { navigator?: unknown }).navigator;
    delete (globalThis as { SharedWorker?: unknown }).SharedWorker;
    delete (globalThis as { Worker?: unknown }).Worker;
    delete (globalThis as { crypto?: unknown }).crypto;
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { navigator?: unknown }).navigator = originalNavigator;
    (globalThis as { SharedWorker?: unknown }).SharedWorker =
      originalSharedWorker;
    (globalThis as { Worker?: unknown }).Worker = originalWorker;
    (globalThis as { crypto?: unknown }).crypto = originalCrypto;
    vi.clearAllMocks();
  });

  it('throws when called outside browser context', async () => {
    await expect(
      createWebSqliteDb({
        storeId: 'store',
        dbName: 'db',
        requireOpfs: false,
      })
    ).rejects.toThrow('createWebSqliteDb must be called in a browser context');
  });

  it('throws when OPFS is required but unavailable', async () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { navigator?: unknown }).navigator = {};
    await expect(
      createWebSqliteDb({
        storeId: 'store',
        dbName: 'db',
        requireOpfs: true,
      })
    ).rejects.toThrow('OPFS is required but unavailable');
  });

  it('uses SharedWorker when available', async () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { navigator?: unknown }).navigator = {
      storage: { getDirectory: () => ({}) },
    };
    (globalThis as { crypto?: { randomUUID: () => string } }).crypto = {
      randomUUID: () => 'client-1',
    };

    class FakeSharedWorker {
      readonly port = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        start: vi.fn(),
      };
      constructor() {}
    }

    (globalThis as { SharedWorker?: unknown }).SharedWorker =
      FakeSharedWorker as unknown as typeof SharedWorker;

    const result = await createWebSqliteDb({
      storeId: 'store',
      dbName: 'db',
      requireOpfs: false,
    });

    expect(sendHello).toHaveBeenCalledTimes(1);
    const hello = (sendHello as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0]?.[1];
    expect(hello).toMatchObject({
      kind: 'hello',
      storeId: 'store',
      dbName: 'db',
      clientInstanceId: 'client-1',
    });
    await result.shutdown();
  });
});
