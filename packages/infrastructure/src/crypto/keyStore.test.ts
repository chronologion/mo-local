import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { KeyWrapping } from './KeyWrapping';
import { IndexedDBKeyStore } from './IndexedDBKeyStore';

const KEY_STORE_DB = 'mo-local-keys';

describe('KeyWrapping', () => {
  it('wraps and unwraps with AES-KW', async () => {
    const key = randomBytes(32);
    const wrapping = randomBytes(32);

    const wrapped = await KeyWrapping.wrapKey(key, wrapping);
    const unwrapped = await KeyWrapping.unwrapKey(wrapped, wrapping);

    expect(unwrapped).toEqual(new Uint8Array(key));
  });
});

describe('IndexedDBKeyStore', () => {
  beforeEach(async () => {
    // Ensure indexedDB exists for tests
    // @ts-expect-error fake indexeddb globals
    globalThis.indexedDB = indexedDB;
    // @ts-expect-error fake indexeddb globals
    globalThis.IDBKeyRange = IDBKeyRange;
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(KEY_STORE_DB);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // best effort cleanup
    });
  });

  it('stores and retrieves identity and aggregate keys, and exports/imports backups', async () => {
    const store = new IndexedDBKeyStore();
    const identityKeys = {
      signingPrivateKey: new Uint8Array(randomBytes(32)),
      signingPublicKey: new Uint8Array(randomBytes(32)),
      encryptionPrivateKey: new Uint8Array(randomBytes(32)),
      encryptionPublicKey: new Uint8Array(randomBytes(32)),
    };
    const wrappedKey = new Uint8Array(randomBytes(32));

    await store.saveIdentityKeys('user-1', identityKeys);
    await store.saveAggregateKey('goal-1', wrappedKey);

    const identity = await store.getIdentityKeys('user-1');
    expect(identity).not.toBeNull();
    expect(identity).toEqual(identityKeys);

    const aggregate = await store.getAggregateKey('goal-1');
    expect(aggregate).toEqual(wrappedKey);

    const backup = await store.exportKeys();
    expect(backup.aggregateKeys['goal-1']).toEqual(wrappedKey);

    const restored = new IndexedDBKeyStore();
    await restored.importKeys(backup);
    expect(await restored.getAggregateKey('goal-1')).toEqual(wrappedKey);
  });
});
