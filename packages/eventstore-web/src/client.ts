import type { ChangeHint, SqliteBatchResult, SqliteDbPort, SqliteStatement, SqliteValue } from './types';
import {
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerNotifyKinds,
  WorkerRequestKinds,
  type WorkerEnvelope,
  type WorkerHello,
  type WorkerNotify,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol/types';

export type MessagePortLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  start?: () => void;
};

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
};

type Subscription = {
  tables: ReadonlyArray<string>;
  listener: () => void;
};

export class DbClient implements SqliteDbPort {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly onMessage = (event: MessageEvent) => {
    const data = event.data as WorkerEnvelope | WorkerNotify | WorkerHello | undefined;
    if (!data || typeof data !== 'object') return;

    if ('kind' in data && data.kind === WorkerNotifyKinds.tablesChanged) {
      this.handleNotify(data as WorkerNotify);
      return;
    }

    if ('kind' in data && data.kind === WorkerEnvelopeKinds.response) {
      this.handleResponse(data as WorkerEnvelope);
    }
  };

  constructor(private readonly port: MessagePortLike) {
    this.port.addEventListener('message', this.onMessage);
    this.port.start?.();
  }

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const data = await this.request({
      kind: WorkerRequestKinds.dbQuery,
      sql,
      params,
    });
    return data as ReadonlyArray<T>;
  }

  async execute(sql: string, params: ReadonlyArray<SqliteValue> = []): Promise<void> {
    await this.request({
      kind: WorkerRequestKinds.dbExecute,
      sql,
      params,
    });
  }

  async batch(statements: ReadonlyArray<SqliteStatement>): Promise<ReadonlyArray<SqliteBatchResult>> {
    const data = await this.request({
      kind: WorkerRequestKinds.dbBatch,
      statements,
    });
    return data as ReadonlyArray<SqliteBatchResult>;
  }

  subscribeToTables(tables: ReadonlyArray<string>, listener: () => void): () => void {
    const subscriptionId = crypto.randomUUID();
    this.subscriptions.set(subscriptionId, {
      tables: tables.map((table) => table.toLowerCase()),
      listener,
    });
    void this.request({
      kind: WorkerRequestKinds.dbSubscribeTables,
      subscriptionId,
      tables: tables.map((table) => table.toLowerCase()),
    }).catch(() => {
      // best-effort; subscriptions are optional
    });

    return () => {
      this.subscriptions.delete(subscriptionId);
      void this.request({
        kind: WorkerRequestKinds.dbUnsubscribeTables,
        subscriptionId,
      }).catch(() => {
        // ignore
      });
    };
  }

  subscribeToChanges(
    _tables: ReadonlyArray<string>,
    _listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): () => void {
    throw new Error('Row-level change hints are not implemented in MVP');
  }

  shutdown(): void {
    this.pending.clear();
    this.subscriptions.clear();
    this.port.removeEventListener('message', this.onMessage);
  }

  async shutdownWorker(): Promise<void> {
    await this.request({
      kind: WorkerRequestKinds.dbShutdown,
    });
  }

  async exportMainDatabase(): Promise<Uint8Array> {
    const data = await this.request({
      kind: WorkerRequestKinds.dbExportMain,
    });
    if (!(data instanceof Uint8Array)) {
      throw new Error('Invalid export response');
    }
    return data;
  }

  async importMainDatabase(bytes: Uint8Array): Promise<void> {
    await this.request({
      kind: WorkerRequestKinds.dbImportMain,
      bytes,
    });
  }

  private async request(payload: WorkerRequest): Promise<unknown> {
    const requestId = crypto.randomUUID();
    const message: WorkerEnvelope = {
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId,
      payload,
    };

    const transferables = collectTransferables(payload);

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.port.postMessage(message, transferables);
    });
  }

  private handleResponse(envelope: WorkerEnvelope): void {
    if (envelope.kind !== WorkerEnvelopeKinds.response) return;
    const pending = this.pending.get(envelope.requestId);
    if (!pending) return;
    this.pending.delete(envelope.requestId);

    const payload = (envelope as Extract<WorkerEnvelope, { kind: typeof WorkerEnvelopeKinds.response }>)
      .payload as WorkerResponse;
    if (payload.kind === 'error') {
      const err = new Error(payload.error.message) as Error & {
        code: string;
        context?: Readonly<Record<string, unknown>>;
      };
      err.name = payload.error.code;
      err.code = payload.error.code;
      err.context = payload.error.context;
      pending.reject(err);
      return;
    }
    pending.resolve(payload.data);
  }

  private handleNotify(message: WorkerNotify): void {
    const changed = new Set(message.tables.map((table) => table.toLowerCase()));
    for (const subscription of this.subscriptions.values()) {
      if (subscription.tables.some((table) => changed.has(table))) {
        subscription.listener();
      }
    }
  }
}

export async function sendHello(
  port: MessagePortLike,
  message: WorkerHello,
  timeoutMs = 5000
): Promise<Extract<WorkerHello, { kind: typeof WorkerHelloKinds.helloOk }>> {
  port.start?.();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      port.removeEventListener('message', handler);
      reject(new Error('Worker hello timeout'));
    }, timeoutMs);
    const handler = (event: MessageEvent) => {
      const data = event.data as WorkerHello | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.kind === WorkerHelloKinds.helloOk) {
        clearTimeout(timeoutId);
        port.removeEventListener('message', handler);
        resolve(data);
        return;
      }
      if (data.kind === WorkerHelloKinds.helloError) {
        clearTimeout(timeoutId);
        port.removeEventListener('message', handler);
        const err = new Error(data.error.message) as Error & {
          code: string;
          context?: Readonly<Record<string, unknown>>;
        };
        err.name = data.error.code;
        err.code = data.error.code;
        err.context = data.error.context;
        reject(err);
      }
    };
    port.addEventListener('message', handler);
    port.postMessage(message);
  });
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
