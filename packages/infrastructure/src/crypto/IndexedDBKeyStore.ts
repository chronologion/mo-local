import { IKeyStore, IdentityKeys, KeyBackup } from '@mo/application';
import { WebCryptoService } from './WebCryptoService';

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
  close(): void;
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
  private readonly crypto = new WebCryptoService();
  private masterKey: Uint8Array | null = null;

  constructor() {
    this.dbPromise = openDb();
  }

  private encodeBase64(data: Uint8Array): string {
    return btoa(String.fromCharCode(...Array.from(data)));
  }

  private decodeBase64(data: string): Uint8Array {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  }

  setMasterKey(key: Uint8Array): void {
    this.masterKey = new Uint8Array(key);
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

    return Promise.race([
      requestToPromise<T>(request),
      new Promise<never>((_, reject) => {
        // best-effort transaction error handling
        (tx as unknown as { onerror: ((ev: unknown) => void) | null }).onerror =
          (ev) =>
            reject((ev as { target?: { error?: unknown } }).target?.error);
      }),
    ]);
  }

  async saveIdentityKeys(userId: string, keys: IdentityKeys): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Master key not set');
    }
    const payload = {
      signingPrivateKey: this.encodeBase64(keys.signingPrivateKey),
      signingPublicKey: this.encodeBase64(keys.signingPublicKey),
      encryptionPrivateKey: this.encodeBase64(keys.encryptionPrivateKey),
      encryptionPublicKey: this.encodeBase64(keys.encryptionPublicKey),
    };
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await this.crypto.encrypt(encoded, this.masterKey);
    await this.withStore<void>(STORE_IDENTITY, 'readwrite', (store) =>
      store.put({ userId, blob: encrypted })
    );
  }

  async getIdentityKeys(userId: string): Promise<IdentityKeys | null> {
    if (!this.masterKey) {
      throw new Error('Master key not set');
    }
    const record = await this.withStore<
      { userId: string; blob: Uint8Array } | null
    >(
      STORE_IDENTITY,
      'readonly',
      (store) => store.get(userId)
    );
    if (!record) return null;
    if (!('blob' in record)) {
      throw new Error(
        'Legacy key format detected; please re-onboard to regenerate encrypted keys.'
      );
    }
    const decrypted = await this.crypto.decrypt(record.blob, this.masterKey);
    const json = new TextDecoder().decode(decrypted);
    const parsed = JSON.parse(json) as {
      signingPrivateKey: string;
      signingPublicKey: string;
      encryptionPrivateKey: string;
      encryptionPublicKey: string;
    };
    return {
      signingPrivateKey: this.decodeBase64(parsed.signingPrivateKey),
      signingPublicKey: this.decodeBase64(parsed.signingPublicKey),
      encryptionPrivateKey: this.decodeBase64(parsed.encryptionPrivateKey),
      encryptionPublicKey: this.decodeBase64(parsed.encryptionPublicKey),
    } satisfies IdentityKeys;
  }

  async saveAggregateKey(
    aggregateId: string,
    wrappedKey: Uint8Array
  ): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Master key not set');
    }
    const encrypted = await this.crypto.encrypt(wrappedKey, this.masterKey);
    await this.withStore<void>(STORE_AGGREGATE, 'readwrite', (store) =>
      store.put({ aggregateId, blob: encrypted })
    );
  }

  async getAggregateKey(aggregateId: string): Promise<Uint8Array | null> {
    if (!this.masterKey) {
      throw new Error('Master key not set');
    }
    const record = await this.withStore<
      { aggregateId: string; blob: Uint8Array } | null
    >(STORE_AGGREGATE, 'readonly', (store) => store.get(aggregateId));
    if (!record) return null;
    if (!('blob' in record)) {
      throw new Error(
        'Legacy aggregate key format detected; please clear local data and re-onboard.'
      );
    }
    const decrypted = await this.crypto.decrypt(record.blob, this.masterKey);
    return new Uint8Array(decrypted);
  }

  async exportKeys(): Promise<KeyBackup> {
    const aggregates = (await this.withStore<
      { aggregateId: string; blob: Uint8Array }[]
    >(STORE_AGGREGATE, 'readonly', (store) => store.getAll())) as {
      aggregateId: string;
      blob: Uint8Array;
    }[];

    const aggregateKeys: Record<string, Uint8Array> = {};
    for (const { aggregateId, blob } of aggregates) {
      if (!this.masterKey) {
        throw new Error('Master key not set');
      }
      if (!('blob' in { blob })) {
        throw new Error(
          'Legacy aggregate key format detected; please clear local data and re-onboard.'
        );
      }
      const decrypted = await this.crypto.decrypt(blob, this.masterKey);
      aggregateKeys[aggregateId] = new Uint8Array(decrypted);
    }

    const records = (await this.withStore<
      { userId: string; blob: Uint8Array }[]
    >(STORE_IDENTITY, 'readonly', (store) => store.getAll())) as {
      userId: string;
      blob: Uint8Array;
    }[];

    const identityRecord = records[0];
    let identityKeys: IdentityKeys | null = null;
    let userId: string | undefined = undefined;
    if (identityRecord) {
      if (!this.masterKey) {
        throw new Error('Master key not set');
      }
      if (!('blob' in identityRecord)) {
        throw new Error(
          'Legacy key format detected; please re-onboard to regenerate encrypted keys.'
        );
      }
      const decrypted = await this.crypto.decrypt(
        identityRecord.blob,
        this.masterKey
      );
      const json = new TextDecoder().decode(decrypted);
      const parsed = JSON.parse(json) as {
        signingPrivateKey: string;
        signingPublicKey: string;
        encryptionPrivateKey: string;
        encryptionPublicKey: string;
      };
      identityKeys = {
        signingPrivateKey: this.decodeBase64(parsed.signingPrivateKey),
        signingPublicKey: this.decodeBase64(parsed.signingPublicKey),
        encryptionPrivateKey: this.decodeBase64(parsed.encryptionPrivateKey),
        encryptionPublicKey: this.decodeBase64(parsed.encryptionPublicKey),
      };
      userId = identityRecord.userId;
    }

    return { identityKeys, aggregateKeys, userId };
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
      await this.saveIdentityKeys(
        backup.userId ?? 'imported',
        backup.identityKeys
      );
    }

    const entries = Object.entries(backup.aggregateKeys);
    await Promise.all(
      entries.map(([aggregateId, wrappedKey]) =>
        this.saveAggregateKey(aggregateId, wrappedKey)
      )
    );
  }

  async clearAll(): Promise<void> {
    const db = await this.dbPromise;
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
  }

  async close(): Promise<void> {
    const db = await this.dbPromise;
    db.close();
  }
}
