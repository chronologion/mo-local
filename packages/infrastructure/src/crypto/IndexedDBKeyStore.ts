import { IKeyStore, IdentityKeys, KeyBackup } from '@mo/application';

type IDBTransactionMode = 'readonly' | 'readwrite';

interface IDBRequestLike<T = unknown> {
  onsuccess: ((this: IDBRequestLike<T>, ev: unknown) => unknown) | null;
  onerror: ((this: IDBRequestLike<T>, ev: unknown) => unknown) | null;
  result: T;
  error: unknown;
}

interface IDBObjectStoreLike {
  put(value: unknown): IDBRequestLike<unknown>;
  get(key: unknown): IDBRequestLike<unknown>;
  getAll(): IDBRequestLike<unknown>;
  clear(): IDBRequestLike<unknown>;
}

interface IDBTransactionLike {
  objectStore(name: string): IDBObjectStoreLike;
}

interface IDBDatabaseLike {
  transaction(name: string, mode: IDBTransactionMode): IDBTransactionLike;
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, opts: { keyPath: string }): void;
}

interface IDBOpenDBRequestLike extends IDBRequestLike<IDBDatabaseLike> {
  onupgradeneeded:
    | ((this: IDBOpenDBRequestLike, ev: unknown) => unknown)
    | null;
  result: IDBDatabaseLike;
}

interface IDBFactoryLike {
  open(name: string, version?: number): IDBOpenDBRequestLike;
  deleteDatabase(name: string): IDBOpenDBRequestLike;
}

declare const indexedDB: IDBFactoryLike;

const DB_NAME = 'mo-local-keys';
const DB_VERSION = 1;
const STORE_IDENTITY = 'identity_keys';
const STORE_AGGREGATE = 'aggregate_keys';

const toBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('Invalid key bytes');
};

const requestToPromise = <T>(request: IDBRequestLike<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });

const openDb = (): Promise<IDBDatabaseLike> =>
  new Promise((resolve, reject) => {
    const req = (indexedDB as unknown as IDBFactoryLike).open(
      DB_NAME,
      DB_VERSION
    ) as unknown as IDBOpenDBRequestLike;

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
        db.createObjectStore(STORE_IDENTITY, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORE_AGGREGATE)) {
        db.createObjectStore(STORE_AGGREGATE, { keyPath: 'aggregateId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export class IndexedDBKeyStore implements IKeyStore {
  private readonly dbPromise: Promise<IDBDatabaseLike>;

  constructor() {
    this.dbPromise = openDb();
  }

  private async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStoreLike) => IDBRequestLike<unknown>
  ): Promise<T> {
    const db = await this.dbPromise;
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store) as IDBRequestLike<T>;
    return requestToPromise<T>(request);
  }

  async saveIdentityKeys(userId: string, keys: IdentityKeys): Promise<void> {
    await this.withStore<void>(STORE_IDENTITY, 'readwrite', (store) =>
      store.put({ userId, ...keys })
    );
  }

  async getIdentityKeys(userId: string): Promise<IdentityKeys | null> {
    const record = await this.withStore<IdentityKeys | null>(
      STORE_IDENTITY,
      'readonly',
      (store) => store.get(userId)
    );
    if (!record) return null;
    const {
      signingPrivateKey,
      signingPublicKey,
      encryptionPrivateKey,
      encryptionPublicKey,
    } = record;
    return {
      signingPrivateKey: toBytes(signingPrivateKey),
      signingPublicKey: toBytes(signingPublicKey),
      encryptionPrivateKey: toBytes(encryptionPrivateKey),
      encryptionPublicKey: toBytes(encryptionPublicKey),
    };
  }

  async saveAggregateKey(
    aggregateId: string,
    wrappedKey: Uint8Array
  ): Promise<void> {
    await this.withStore<void>(STORE_AGGREGATE, 'readwrite', (store) =>
      store.put({ aggregateId, wrappedKey })
    );
  }

  async getAggregateKey(aggregateId: string): Promise<Uint8Array | null> {
    const record = await this.withStore<{
      aggregateId: string;
      wrappedKey: Uint8Array;
    } | null>(STORE_AGGREGATE, 'readonly', (store) => store.get(aggregateId));
    return record ? toBytes(record.wrappedKey) : null;
  }

  async exportKeys(): Promise<KeyBackup> {
    const aggregates = (await this.withStore<
      { aggregateId: string; wrappedKey: Uint8Array }[]
    >(STORE_AGGREGATE, 'readonly', (store) => store.getAll())) as {
      aggregateId: string;
      wrappedKey: Uint8Array;
    }[];

    const aggregateKeys: Record<string, Uint8Array> = {};
    aggregates.forEach(({ aggregateId, wrappedKey }) => {
      aggregateKeys[aggregateId] = toBytes(wrappedKey);
    });

    const identities = (await this.withStore<IdentityKeys[]>(
      STORE_IDENTITY,
      'readonly',
      (store) => store.getAll()
    )) as IdentityKeys[];

    const identityKeys =
      identities[0] ??
      ({
        signingPrivateKey: new Uint8Array(),
        signingPublicKey: new Uint8Array(),
        encryptionPrivateKey: new Uint8Array(),
        encryptionPublicKey: new Uint8Array(),
      } as IdentityKeys);

    return { identityKeys, aggregateKeys };
  }

  async importKeys(backup: KeyBackup): Promise<void> {
    const db = await this.dbPromise;

    // clear stores
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_IDENTITY, 'readwrite');
        const req = tx.objectStore(STORE_IDENTITY).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_AGGREGATE, 'readwrite');
        const req = tx.objectStore(STORE_AGGREGATE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ]);

    if (backup.identityKeys) {
      await this.saveIdentityKeys('imported', backup.identityKeys);
    }

    const entries = Object.entries(backup.aggregateKeys);
    for (const [aggregateId, wrappedKey] of entries) {
      await this.saveAggregateKey(aggregateId, wrappedKey);
    }
  }
}
