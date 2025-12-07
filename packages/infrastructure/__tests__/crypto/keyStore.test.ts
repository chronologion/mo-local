import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { KeyWrapping } from '../../src/crypto/KeyWrapping';
import { IndexedDBKeyStore } from '../../src/crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../../src/crypto/WebCryptoService';

const KEY_STORE_DB = 'mo-local-keys';

const resetDb = async () =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(KEY_STORE_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

describe('KeyWrapping', () => {
  it('wraps and unwraps with AES-KW', async () => {
    const key = randomBytes(32);
    const wrapping = randomBytes(32);

    const wrapped = await KeyWrapping.wrapKey(key, wrapping);
    const unwrapped = await KeyWrapping.unwrapKey(wrapped, wrapping);

    expect(unwrapped).toEqual(new Uint8Array(key));
  });

  it('rejects invalid key lengths and wrapped length', async () => {
    await expect(
      KeyWrapping.wrapKey(new Uint8Array(16), new Uint8Array(32))
    ).rejects.toThrow();
    await expect(
      KeyWrapping.unwrapKey(new Uint8Array(10), new Uint8Array(32))
    ).rejects.toThrow();
  });
});

describe('IndexedDBKeyStore', () => {
  const crypto = new WebCryptoService();
  let masterKey: Uint8Array;

  beforeEach(async () => {
    // Ensure indexedDB exists for tests
    // @ts-expect-error fake indexeddb globals
    globalThis.indexedDB = indexedDB;
    // @ts-expect-error fake indexeddb globals
    globalThis.IDBKeyRange = IDBKeyRange;
    await resetDb();
    masterKey = await crypto.generateKey();
  });

  it('stores and retrieves identity and aggregate keys, and exports/imports backups', async () => {
    const store = new IndexedDBKeyStore();
    store.setMasterKey(masterKey);
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
    restored.setMasterKey(masterKey);
    await restored.importKeys(backup);
    expect(await restored.getAggregateKey('goal-1')).toEqual(wrappedKey);

    await store.close();
    await restored.close();
  });

  it('returns nulls when keys missing and overwrites on import', async () => {
    const store = new IndexedDBKeyStore();
    store.setMasterKey(masterKey);
    expect(await store.getIdentityKeys('nope')).toBeNull();
    expect(await store.getAggregateKey('nope')).toBeNull();
    const backup = await store.exportKeys();
    expect(backup.identityKeys).toBeNull();

    const identityKeys = {
      signingPrivateKey: new Uint8Array([1]),
      signingPublicKey: new Uint8Array([2]),
      encryptionPrivateKey: new Uint8Array([3]),
      encryptionPublicKey: new Uint8Array([4]),
    };
    await store.saveIdentityKeys('user-a', identityKeys);
    await store.saveAggregateKey('goal-x', new Uint8Array([9]));

    const overwrite = new IndexedDBKeyStore();
    overwrite.setMasterKey(masterKey);
    await overwrite.importKeys({
      userId: 'user-b',
      identityKeys,
      aggregateKeys: { 'goal-y': new Uint8Array([7]) },
    });
    expect(await overwrite.getIdentityKeys('user-b')).toEqual(identityKeys);
    expect(await overwrite.getAggregateKey('goal-y')).toEqual(
      new Uint8Array([7])
    );

    await store.close();
    await overwrite.close();
  });
});
