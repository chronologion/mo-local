import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformErrorCodes } from '@mo/eventstore-core';
import {
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerNotifyKinds,
  WorkerRequestKinds,
  WorkerResponseKinds,
  type WorkerEnvelope,
  type WorkerHello,
  type WorkerNotify,
} from '../src/protocol/types';

type SqliteContext = import('../src/worker/sqlite').SqliteContext;

const sqliteMocks = vi.hoisted(() => ({
  createSqliteContext: vi.fn(),
  closeSqliteContext: vi.fn(),
  exportVfsFileBytes: vi.fn(),
  SqliteInitError: class SqliteInitError extends Error {
    readonly stage: string;
    readonly cause: unknown;

    constructor(stage: string, cause: unknown, message: string) {
      super(message);
      this.name = 'SqliteInitError';
      this.stage = stage;
      this.cause = cause;
    }
  },
  runQuery: vi.fn(),
  runExecute: vi.fn(),
  executeStatements: vi.fn(),
  extractTableNames: vi.fn(),
  toPlatformError: vi.fn(),
}));

vi.mock('../src/worker/sqlite', () => sqliteMocks);

type PostedMessage = {
  message: unknown;
  transfer?: Transferable[];
};

const setupWorker = async () => {
  vi.resetModules();
  sqliteMocks.createSqliteContext.mockReset();
  sqliteMocks.closeSqliteContext.mockReset();
  sqliteMocks.exportVfsFileBytes.mockReset();
  sqliteMocks.runQuery.mockReset();
  sqliteMocks.runExecute.mockReset();
  sqliteMocks.executeStatements.mockReset();
  sqliteMocks.extractTableNames.mockReset();
  sqliteMocks.toPlatformError.mockReset();

  const ctx: SqliteContext = {
    sqlite3: {},
    db: 1,
    vfsName: 'test',
    vfs: {},
  } as SqliteContext;
  sqliteMocks.createSqliteContext.mockResolvedValue(ctx);
  sqliteMocks.runQuery.mockResolvedValue([{ id: 1 }]);
  sqliteMocks.runExecute.mockResolvedValue(undefined);
  sqliteMocks.executeStatements.mockResolvedValue([{ kind: 'execute' }]);
  sqliteMocks.extractTableNames.mockReturnValue(['EVENTS']);
  sqliteMocks.closeSqliteContext.mockResolvedValue(undefined);
  sqliteMocks.exportVfsFileBytes.mockReturnValue(new Uint8Array([1, 2, 3]));
  sqliteMocks.toPlatformError.mockImplementation((error: unknown) => ({
    code: PlatformErrorCodes.WorkerProtocolError,
    message: error instanceof Error ? error.message : String(error),
  }));

  const listeners = new Set<(event: MessageEvent) => void>();
  const posted: PostedMessage[] = [];

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: (_name: string, _opts: unknown, cb: () => Promise<void>) =>
          Promise.resolve(cb()),
      },
      storage: {
        getDirectory: () => ({}),
      },
    },
  });

  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: {
      addEventListener: (
        _type: string,
        listener: (event: MessageEvent) => void
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: MessageEvent) => void
      ) => listeners.delete(listener),
      postMessage: (message: unknown, transfer?: Transferable[]) =>
        posted.push({ message, transfer }),
    },
  });

  await import('../src/worker/owner.worker');

  const emit = (data: unknown) => {
    for (const listener of listeners) {
      listener({ data } as MessageEvent);
    }
  };

  const flush = () =>
    new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });

  return { emit, posted, flush };
};

const sendHello = (emit: (data: unknown) => void) => {
  const hello: WorkerHello = {
    v: 1,
    kind: WorkerHelloKinds.hello,
    storeId: 'store',
    clientInstanceId: 'client',
    dbName: 'db',
    requireOpfs: false,
  };
  emit(hello);
};

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  delete (globalThis as { self?: unknown }).self;
  delete (globalThis as { navigator?: unknown }).navigator;
  vi.clearAllMocks();
});

describe('owner.worker', () => {
  it('responds to hello and query requests', async () => {
    const { emit, posted, flush } = await setupWorker();
    sendHello(emit);
    await flush();

    const queryRequest: WorkerEnvelope = {
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'req-1',
      payload: {
        kind: WorkerRequestKinds.dbQuery,
        sql: 'SELECT 1',
        params: [],
      },
    };
    emit(queryRequest);
    await flush();

    const response = posted.find(
      (entry) =>
        (entry.message as WorkerEnvelope).kind ===
          WorkerEnvelopeKinds.response &&
        (entry.message as WorkerEnvelope).requestId === 'req-1'
    );
    expect(response?.message).toMatchObject({
      kind: WorkerEnvelopeKinds.response,
      requestId: 'req-1',
      payload: { kind: WorkerResponseKinds.ok, data: [{ id: 1 }] },
    });
  });

  it('notifies table subscribers after execute', async () => {
    const { emit, posted, flush } = await setupWorker();
    sendHello(emit);
    await flush();

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'sub-1',
      payload: {
        kind: WorkerRequestKinds.dbSubscribeTables,
        subscriptionId: 'sub',
        tables: ['events'],
      },
    });
    await flush();

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'exec-1',
      payload: {
        kind: WorkerRequestKinds.dbExecute,
        sql: 'INSERT INTO events (id) VALUES (?)',
        params: [1],
      },
    });
    await flush();

    const notify = posted.find(
      (entry) =>
        (entry.message as WorkerNotify).kind === WorkerNotifyKinds.tablesChanged
    );
    expect(notify?.message).toMatchObject({
      kind: WorkerNotifyKinds.tablesChanged,
      tables: ['events'],
    });
  });

  it('respects cancellation requests', async () => {
    const { emit, posted, flush } = await setupWorker();
    sendHello(emit);
    await flush();

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.cancel,
      requestId: 'cancel-1',
      targetRequestId: 'req-cancel',
    });

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'req-cancel',
      payload: {
        kind: WorkerRequestKinds.dbExecute,
        sql: 'DELETE FROM events',
        params: [],
      },
    });
    await flush();

    const response = posted.find(
      (entry) =>
        (entry.message as WorkerEnvelope).kind ===
          WorkerEnvelopeKinds.response &&
        (entry.message as WorkerEnvelope).requestId === 'req-cancel'
    );
    expect(response?.message).toMatchObject({
      kind: WorkerEnvelopeKinds.response,
      requestId: 'req-cancel',
      payload: {
        kind: WorkerResponseKinds.error,
        error: {
          code: PlatformErrorCodes.CanceledError,
          message: 'Request was canceled',
        },
      },
    });
  });

  it('shuts down sqlite context and releases lock on db.shutdown', async () => {
    const { emit, posted, flush } = await setupWorker();
    sendHello(emit);
    await flush();

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'shutdown-1',
      payload: {
        kind: WorkerRequestKinds.dbShutdown,
      },
    });
    await flush();

    expect(sqliteMocks.closeSqliteContext).toHaveBeenCalledTimes(1);

    const response = posted.find(
      (entry) =>
        (entry.message as WorkerEnvelope).kind ===
          WorkerEnvelopeKinds.response &&
        (entry.message as WorkerEnvelope).requestId === 'shutdown-1'
    );
    expect(response?.message).toMatchObject({
      kind: WorkerEnvelopeKinds.response,
      requestId: 'shutdown-1',
      payload: { kind: WorkerResponseKinds.ok, data: null },
    });
  });

  it('exports main db bytes on db.exportMain', async () => {
    const { emit, posted, flush } = await setupWorker();
    sendHello(emit);
    await flush();

    emit({
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId: 'export-1',
      payload: {
        kind: WorkerRequestKinds.dbExportMain,
      },
    });
    await flush();

    expect(sqliteMocks.exportVfsFileBytes).toHaveBeenCalledTimes(1);

    const response = posted.find(
      (entry) =>
        (entry.message as WorkerEnvelope).kind ===
          WorkerEnvelopeKinds.response &&
        (entry.message as WorkerEnvelope).requestId === 'export-1'
    )?.message as WorkerEnvelope | undefined;

    expect(response).toBeTruthy();
    if (response && response.kind === WorkerEnvelopeKinds.response) {
      expect(response.payload).toMatchObject({ kind: WorkerResponseKinds.ok });
      expect(
        (response.payload as { kind: string; data: unknown }).data
      ).toBeInstanceOf(Uint8Array);
    }
  });
});
