import { DbClient, sendHello, type MessagePortLike } from './client';
import type { WorkerHello } from './protocol/types';
import { WorkerHelloKinds } from './protocol/types';
import type { SqliteDbPort } from './types';

export type {
  SqliteValue,
  SqliteTableName,
  ChangeOperation,
  ChangeHint,
  ChangeHintKind,
  SqliteStatementKind,
  SqliteStatement,
  SqliteBatchResult,
  SqliteDbPort,
} from './types';

export { ChangeOperations, ChangeHintKinds, SqliteStatementKinds } from './types';

export type { DbOwnershipMode, WorkerEnvelope, WorkerHello, WorkerRequest, WorkerResponse } from './protocol/types';

export type WebSqliteOptions = Readonly<{
  storeId: string;
  dbName: string;
  requireOpfs: boolean;
}>;

type SharedWorkerLike = {
  port: MessagePortLike & { close?: () => void };
};

type SharedWorkerConstructor = new (url: URL, options: { type: 'module'; name?: string }) => SharedWorkerLike;

const tryInvoke = (value: unknown): void => {
  if (typeof value === 'function') {
    value();
  }
};

export async function createWebSqliteDb(
  options: WebSqliteOptions
): Promise<{ db: SqliteDbPort; shutdown: () => Promise<void> }> {
  if (typeof window === 'undefined') {
    throw new Error('createWebSqliteDb must be called in a browser context');
  }
  if (options.requireOpfs && !hasOpfsSupport()) {
    throw new Error(
      'OPFS is required but unavailable in this browser context (requires a secure context and StorageManager.getDirectory).'
    );
  }

  const clientInstanceId = crypto.randomUUID();
  const sharedWorkerSupported = typeof SharedWorker !== 'undefined';
  let worker: Worker | null = null;
  let closeSharedPort: (() => void) | null = null;
  let port: MessagePortLike;

  const createSharedWorkerPort = (): MessagePortLike => {
    const SharedWorkerCtor = SharedWorker as SharedWorkerConstructor;
    const sharedWorker = new SharedWorkerCtor(new URL('./worker/owner.worker.ts', import.meta.url), {
      type: 'module',
      name: `mo-eventstore:${options.storeId}`,
    });
    closeSharedPort = () => sharedWorker.port.close?.();
    return {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          sharedWorker.port.postMessage(message, transfer);
        } else {
          sharedWorker.port.postMessage(message);
        }
      },
      addEventListener: (type, listener) => sharedWorker.port.addEventListener(type, listener),
      removeEventListener: (type, listener) => sharedWorker.port.removeEventListener(type, listener),
      start: () => sharedWorker.port.start?.(),
    };
  };

  const createDedicatedWorkerPort = (): MessagePortLike => {
    worker = new Worker(new URL('./worker/owner.worker.ts', import.meta.url), {
      type: 'module',
    });
    return {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          worker?.postMessage(message, transfer);
        } else {
          worker?.postMessage(message);
        }
      },
      addEventListener: (type, listener) => worker?.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) => worker?.removeEventListener(type, listener as EventListener),
    };
  };

  try {
    port = sharedWorkerSupported ? createSharedWorkerPort() : createDedicatedWorkerPort();
  } catch {
    closeSharedPort = null;
    port = createDedicatedWorkerPort();
  }

  const hello: WorkerHello = {
    v: 1,
    kind: WorkerHelloKinds.hello,
    storeId: options.storeId,
    clientInstanceId,
    dbName: options.dbName,
    requireOpfs: options.requireOpfs,
  };
  let helloOk: Extract<WorkerHello, { kind: typeof WorkerHelloKinds.helloOk }>;
  try {
    helloOk = await sendHello(port, hello);
  } catch (error) {
    const canFallback = closeSharedPort !== null;
    if (canFallback) {
      try {
        tryInvoke(closeSharedPort);
      } catch {
        // ignore
      }
      closeSharedPort = null;
      port = createDedicatedWorkerPort();
      helloOk = await sendHello(port, hello);
    } else {
      throw error;
    }
  }
  const client = new DbClient(port);

  return {
    db: client,
    shutdown: async () => {
      if (helloOk.ownershipMode.type === 'dedicatedWorker') {
        try {
          await client.shutdownWorker();
        } catch {
          // best-effort; worker may already be gone
        }
      }
      client.shutdown();
      if (worker) {
        worker.terminate();
      }
      tryInvoke(closeSharedPort);
    },
  };
}

function hasOpfsSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  );
}
