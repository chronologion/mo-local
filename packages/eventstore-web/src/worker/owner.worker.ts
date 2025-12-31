import { PlatformErrorCodes, type PlatformError } from '@mo/eventstore-core';
import {
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerNotifyKinds,
  WorkerRequestKinds,
  type DbOwnershipMode,
  type WorkerEnvelope,
  type WorkerHello,
  type WorkerNotify,
  type WorkerRequest,
  type WorkerResponse,
} from '../protocol/types';
import {
  createSqliteContext,
  executeStatements,
  extractTableNames,
  runExecute,
  runQuery,
  toPlatformError,
  type SqliteContext,
} from './sqlite';

type PortLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent) => void
  ) => void;
  removeEventListener: (
    type: 'message',
    listener: (event: MessageEvent) => void
  ) => void;
  start?: () => void;
};

type Subscription = {
  tables: ReadonlyArray<string>;
};

type Connection = {
  port: PortLike;
  subscriptions: Map<string, Subscription>;
};

class DbOwnerServer {
  private readonly connections = new Set<Connection>();
  private readonly canceledRequests = new Set<string>();
  private readonly serverInstanceId = crypto.randomUUID();

  private ctx: SqliteContext | null = null;
  private storeId: string | null = null;
  private dbName: string | null = null;
  private ownershipMode: DbOwnershipMode;
  private releaseLock: (() => void) | null = null;

  constructor(ownershipMode: DbOwnershipMode) {
    this.ownershipMode = ownershipMode;
  }

  attachPort(port: PortLike): void {
    const connection: Connection = {
      port,
      subscriptions: new Map(),
    };
    const handler = (event: MessageEvent) => {
      const data = event.data as WorkerHello | WorkerEnvelope | undefined;
      if (!data || typeof data !== 'object') return;
      if ('kind' in data && data.kind === WorkerHelloKinds.hello) {
        void this.handleHello(connection, data as WorkerHello);
        return;
      }
      if ('kind' in data && data.kind === WorkerEnvelopeKinds.cancel) {
        this.canceledRequests.add(data.targetRequestId);
        return;
      }
      if ('kind' in data && data.kind === WorkerEnvelopeKinds.request) {
        void this.handleRequest(connection, data as WorkerEnvelope);
      }
    };
    port.addEventListener('message', handler);
    port.start?.();
    this.connections.add(connection);
  }

  private async handleHello(
    connection: Connection,
    message: WorkerHello
  ): Promise<void> {
    if (message.kind !== WorkerHelloKinds.hello) return;

    if (!this.ctx) {
      this.storeId = message.storeId;
      this.dbName = message.dbName;
      console.info('[DbOwnerServer] initializing', {
        storeId: message.storeId,
        dbName: message.dbName,
        requireOpfs: message.requireOpfs,
        ownershipMode: this.ownershipMode,
      });
      if (message.requireOpfs) {
        await this.assertOpfsSupport();
      }
      if (this.ownershipMode.type === 'dedicatedWorker') {
        await this.acquireLock(message.storeId);
      }
      try {
        this.ctx = await createSqliteContext({
          storeId: message.storeId,
          dbName: message.dbName,
        });
      } catch (error) {
        const name =
          typeof error === 'object' && error && 'name' in error
            ? String((error as { name?: unknown }).name)
            : 'UnknownError';
        const messageText =
          error instanceof Error ? error.message : String(error);
        console.error('[DbOwnerServer] initialization failed', {
          storeId: message.storeId,
          dbName: message.dbName,
          errorName: name,
          errorMessage: messageText,
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        if (name === 'InvalidStateError') {
          const response: WorkerResponse = {
            kind: 'error',
            error: {
              code: PlatformErrorCodes.DbInvalidStateError,
              message:
                'OPFS is in an invalid state. Use Reset Local State and restore from backup.',
              context: { suggestedAction: 'reset' },
            },
          };
          const envelope: WorkerEnvelope = {
            v: 1,
            kind: WorkerEnvelopeKinds.response,
            requestId: crypto.randomUUID(),
            payload: response,
          };
          connection.port.postMessage(envelope);
          return;
        }
        this.sendInitError(connection, error);
        return;
      }
    }

    if (this.storeId !== message.storeId || this.dbName !== message.dbName) {
      const error: PlatformError = {
        code: PlatformErrorCodes.DbOwnershipError,
        message: 'Worker already initialized for a different storeId or dbName',
      };
      const response: WorkerResponse = { kind: 'error', error };
      const envelope: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: crypto.randomUUID(),
        payload: response,
      };
      connection.port.postMessage(envelope);
      return;
    }

    const helloOk: WorkerHello = {
      v: 1,
      kind: WorkerHelloKinds.helloOk,
      protocolVersion: 1,
      ownershipMode: this.ownershipMode,
      serverInstanceId: this.serverInstanceId,
    };
    connection.port.postMessage(helloOk);
  }

  private async handleRequest(
    connection: Connection,
    envelope: WorkerEnvelope
  ): Promise<void> {
    if (!this.ctx) {
      return;
    }
    if (envelope.kind !== WorkerEnvelopeKinds.request) return;

    if (this.canceledRequests.has(envelope.requestId)) {
      this.canceledRequests.delete(envelope.requestId);
      const response: WorkerResponse = {
        kind: 'error',
        error: {
          code: PlatformErrorCodes.CanceledError,
          message: 'Request was canceled',
        },
      };
      this.sendResponse(connection, envelope.requestId, response);
      return;
    }

    const payload = envelope.payload as WorkerRequest;
    try {
      if (payload.kind === WorkerRequestKinds.dbQuery) {
        const rows = await runQuery(
          this.ctx.sqlite3,
          this.ctx.db,
          payload.sql,
          payload.params
        );
        this.sendResponse(connection, envelope.requestId, {
          kind: 'ok',
          data: rows,
        });
        return;
      }

      if (payload.kind === WorkerRequestKinds.dbExecute) {
        await runExecute(
          this.ctx.sqlite3,
          this.ctx.db,
          payload.sql,
          payload.params
        );
        const tables = extractTableNames(payload.sql).map((t) =>
          t.toLowerCase()
        );
        this.notifyTables(tables);
        this.sendResponse(connection, envelope.requestId, {
          kind: 'ok',
          data: null,
        });
        return;
      }

      if (payload.kind === WorkerRequestKinds.dbBatch) {
        const results = await executeStatements(this.ctx, payload.statements);
        const tables = payload.statements
          .map((statement) => extractTableNames(statement.sql))
          .flat()
          .map((t) => t.toLowerCase());
        this.notifyTables(tables);
        this.sendResponse(connection, envelope.requestId, {
          kind: 'ok',
          data: results,
        });
        return;
      }

      if (payload.kind === WorkerRequestKinds.dbSubscribeTables) {
        connection.subscriptions.set(payload.subscriptionId, {
          tables: payload.tables.map((t) => t.toLowerCase()),
        });
        this.sendResponse(connection, envelope.requestId, {
          kind: 'ok',
          data: null,
        });
        return;
      }

      if (payload.kind === WorkerRequestKinds.dbUnsubscribeTables) {
        connection.subscriptions.delete(payload.subscriptionId);
        this.sendResponse(connection, envelope.requestId, {
          kind: 'ok',
          data: null,
        });
        return;
      }

      const error: PlatformError = {
        code: PlatformErrorCodes.WorkerProtocolError,
        message: `Unsupported request kind: ${payload.kind}`,
      };
      this.sendResponse(connection, envelope.requestId, {
        kind: 'error',
        error,
      });
    } catch (error) {
      this.sendResponse(connection, envelope.requestId, {
        kind: 'error',
        error: toPlatformError(error),
      });
    }
  }

  private sendResponse(
    connection: Connection,
    requestId: string,
    payload: WorkerResponse
  ): void {
    const envelope: WorkerEnvelope = {
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId,
      payload,
    };
    connection.port.postMessage(envelope, collectTransferables(payload));
  }

  private sendInitError(connection: Connection, error: unknown): void {
    const response: WorkerResponse = {
      kind: 'error',
      error: toPlatformError(error),
    };
    const envelope: WorkerEnvelope = {
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: crypto.randomUUID(),
      payload: response,
    };
    connection.port.postMessage(envelope);
  }

  private notifyTables(tables: ReadonlyArray<string>): void {
    if (tables.length === 0) return;
    for (const connection of this.connections) {
      const shouldNotify = Array.from(connection.subscriptions.values()).some(
        (subscription) =>
          subscription.tables.some((table) => tables.includes(table))
      );
      if (!shouldNotify) continue;
      const message: WorkerNotify = {
        v: 1,
        kind: WorkerNotifyKinds.tablesChanged,
        tables,
      };
      connection.port.postMessage(message, collectTransferables(message));
    }
  }

  private async assertOpfsSupport(): Promise<void> {
    if (
      typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage.getDirectory !== 'function'
    ) {
      throw new Error('OPFS is not available in this environment');
    }
  }

  private async acquireLock(storeId: string): Promise<void> {
    if (!('locks' in navigator)) {
      throw new Error('Web Locks API is not available');
    }
    const lockName = `mo-eventstore:${storeId}`;
    await new Promise<void>((resolve) => {
      const release = new Promise<void>((releaseResolve) => {
        this.releaseLock = releaseResolve;
      });
      void navigator.locks.request(
        lockName,
        { mode: 'exclusive' },
        async () => {
          resolve();
          await release;
        }
      );
    });
  }
}

function collectTransferables(value: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  const seen = new Set<unknown>();

  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item instanceof Uint8Array) {
      transferables.push(item.buffer);
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    for (const entry of Object.values(item as Record<string, unknown>)) {
      visit(entry);
    }
  };

  visit(value);
  return transferables;
}

const isSharedWorker = 'onconnect' in self;

const ownershipMode: DbOwnershipMode = isSharedWorker
  ? { type: 'sharedWorker', workerId: crypto.randomUUID() }
  : { type: 'dedicatedWorker', tabId: crypto.randomUUID(), lockHeld: true };

const server = new DbOwnerServer(ownershipMode);

if (isSharedWorker && 'onconnect' in self) {
  const sharedScope = self as SharedWorkerGlobalScope;
  sharedScope.onconnect = (event) => {
    const port = (event as MessageEvent & { ports: readonly MessagePort[] })
      .ports[0];
    server.attachPort(wrapPort(port));
  };
} else {
  const port: PortLike = {
    postMessage: (message, transfer) => {
      if (transfer && transfer.length > 0) {
        (self as DedicatedWorkerGlobalScope).postMessage(message, transfer);
      } else {
        (self as DedicatedWorkerGlobalScope).postMessage(message);
      }
    },
    addEventListener: (type, listener) => {
      self.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type, listener) => {
      self.removeEventListener(type, listener as EventListener);
    },
  };
  server.attachPort(port);
}

function wrapPort(port: MessagePort): PortLike {
  return {
    postMessage: (message, transfer) => {
      if (transfer && transfer.length > 0) {
        port.postMessage(message, transfer);
      } else {
        port.postMessage(message);
      }
    },
    addEventListener: (type, listener) => port.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      port.removeEventListener(type, listener),
    start: () => port.start(),
  };
}
