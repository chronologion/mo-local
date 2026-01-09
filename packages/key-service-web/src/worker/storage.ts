export type StorageEntry = Readonly<{
  namespace: string;
  key: string;
  value: Uint8Array;
}>;

type IDBTransactionMode = 'readonly' | 'readwrite';

interface IDBRequestLike<T = unknown> {
  onsuccess: ((this: IDBRequestLike<T>, ev: unknown) => unknown) | null;
  onerror: ((this: IDBRequestLike<T>, ev: unknown) => unknown) | null;
  result: T;
  error: unknown;
}

interface IDBObjectStoreLike {
  put(value: unknown): IDBRequestLike<unknown>;
  getAll(): IDBRequestLike<unknown>;
  clear(): IDBRequestLike<unknown>;
}

interface IDBTransactionLike {
  objectStore(name: string): IDBObjectStoreLike;
  onerror: ((ev: unknown) => unknown) | null;
}

interface IDBDatabaseLike {
  transaction(name: string, mode: IDBTransactionMode): IDBTransactionLike;
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, opts: { keyPath: string }): void;
  close(): void;
}

interface IDBOpenDBRequestLike extends IDBRequestLike<IDBDatabaseLike> {
  onupgradeneeded: ((this: IDBOpenDBRequestLike, ev: unknown) => unknown) | null;
  result: IDBDatabaseLike;
}

interface IDBFactoryLike {
  open(name: string, version?: number): IDBOpenDBRequestLike;
}

declare const indexedDB: IDBFactoryLike;

const DB_VERSION = 1;
const STORE_NAME = 'key_service_kv';

const requestToPromise = <T>(request: IDBRequestLike<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });

const openDb = (name: string): Promise<IDBDatabaseLike> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const buildId = (namespace: string, key: string): string => `${namespace}:${key}`;

type StorageRecord = {
  id: string;
  namespace: string;
  key: string;
  value: Uint8Array;
};

export class KeyServiceStorage {
  private readonly dbPromise: Promise<IDBDatabaseLike>;

  constructor(storeId: string) {
    this.dbPromise = openDb(`mo-key-service-${storeId}`);
  }

  async loadAll(): Promise<StorageEntry[]> {
    const rows = await this.withStore<StorageRecord[]>(STORE_NAME, 'readonly', (store) => store.getAll());
    return rows.map((row) => ({
      namespace: row.namespace,
      key: row.key,
      value: row.value,
    }));
  }

  async putEntries(entries: StorageEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const requests = entries.map((entry) => {
        const record: StorageRecord = {
          id: buildId(entry.namespace, entry.key),
          namespace: entry.namespace,
          key: entry.key,
          value: entry.value,
        };
        return requestToPromise(store.put(record) as IDBRequestLike<unknown>);
      });
      tx.onerror = (ev) => reject((ev as { target?: { error?: unknown } }).target?.error);
      void Promise.all(requests)
        .then(() => resolve())
        .catch((error) => reject(error));
    });
  }

  async clear(): Promise<void> {
    await this.withStore<void>(STORE_NAME, 'readwrite', (store) => store.clear());
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
        tx.onerror = (ev) => reject((ev as { target?: { error?: unknown } }).target?.error);
      }),
    ]);
  }
}
