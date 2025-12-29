import { DbClient, sendHello, type MessagePortLike } from './client';
import type { WorkerHello } from './protocol/types';
import { WorkerHelloKinds } from './protocol/types';
import type { SqliteDbPort } from './types';

export type {
  SqliteValue,
  SqliteTableName,
  ChangeOperation,
  ChangeHint,
  SqliteStatement,
  SqliteBatchResult,
  SqliteDbPort,
} from './types';

export type {
  DbOwnershipMode,
  WorkerEnvelope,
  WorkerHello,
  WorkerRequest,
  WorkerResponse,
} from './protocol/types';

export type WebSqliteOptions = Readonly<{
  storeId: string;
  dbName: string;
  requireOpfs: boolean;
}>;

export async function createWebSqliteDb(
  options: WebSqliteOptions
): Promise<{ db: SqliteDbPort; shutdown: () => Promise<void> }> {
  if (typeof window === 'undefined') {
    throw new Error('createWebSqliteDb must be called in a browser context');
  }
  if (options.requireOpfs && !hasOpfsSupport()) {
    throw new Error('OPFS is required but unavailable');
  }

  const clientInstanceId = crypto.randomUUID();
  const sharedWorkerSupported = typeof SharedWorker !== 'undefined';
  let worker: Worker | null = null;
  let port: MessagePortLike;

  if (sharedWorkerSupported) {
    const sharedWorker = new SharedWorker(
      new URL('./worker/owner.worker.ts', import.meta.url),
      {
        type: 'module',
        name: `mo-eventstore:${options.storeId}`,
      }
    );
    port = {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          sharedWorker.port.postMessage(message, transfer);
        } else {
          sharedWorker.port.postMessage(message);
        }
      },
      addEventListener: (type, listener) =>
        sharedWorker.port.addEventListener(type, listener),
      removeEventListener: (type, listener) =>
        sharedWorker.port.removeEventListener(type, listener),
      start: () => sharedWorker.port.start(),
    };
  } else {
    worker = new Worker(new URL('./worker/owner.worker.ts', import.meta.url), {
      type: 'module',
    });
    port = {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          worker?.postMessage(message, transfer);
        } else {
          worker?.postMessage(message);
        }
      },
      addEventListener: (type, listener) =>
        worker?.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) =>
        worker?.removeEventListener(type, listener as EventListener),
    };
  }

  const hello: WorkerHello = {
    v: 1,
    kind: WorkerHelloKinds.hello,
    storeId: options.storeId,
    clientInstanceId,
    dbName: options.dbName,
    requireOpfs: options.requireOpfs,
  };
  const _helloOk = await sendHello(port, hello);
  const client = new DbClient(port);

  return {
    db: client,
    shutdown: async () => {
      client.shutdown();
      if (worker) {
        worker.terminate();
      }
    },
  };
}

function hasOpfsSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  );
}
