import type { PlatformError } from '@mo/eventstore-core';
import type { SqliteStatement, SqliteValue } from '../types';

export type DbOwnershipMode =
  | Readonly<{ type: 'sharedWorker'; workerId: string }>
  | Readonly<{ type: 'dedicatedWorker'; tabId: string; lockHeld: true }>
  | Readonly<{ type: 'mainThread'; singleTabOnly: true }>;

export const WorkerEnvelopeKinds = {
  request: 'request',
  response: 'response',
  cancel: 'cancel',
} as const;

export type WorkerEnvelopeKind =
  (typeof WorkerEnvelopeKinds)[keyof typeof WorkerEnvelopeKinds];

export type WorkerEnvelope =
  | Readonly<{
      v: 1;
      kind: typeof WorkerEnvelopeKinds.request;
      requestId: string;
      payload: WorkerRequest;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerEnvelopeKinds.response;
      requestId: string;
      payload: WorkerResponse;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerEnvelopeKinds.cancel;
      requestId: string;
      targetRequestId: string;
    }>;

export const WorkerHelloKinds = {
  hello: 'hello',
  helloOk: 'hello.ok',
  helloError: 'hello.error',
} as const;

export type WorkerHelloKind =
  (typeof WorkerHelloKinds)[keyof typeof WorkerHelloKinds];

export type WorkerHello =
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.hello;
      storeId: string;
      clientInstanceId: string;
      dbName: string;
      requireOpfs: boolean;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.helloOk;
      protocolVersion: 1;
      ownershipMode: DbOwnershipMode;
      serverInstanceId: string;
    }>
  | Readonly<{
      v: 1;
      kind: typeof WorkerHelloKinds.helloError;
      error: PlatformError;
    }>;

export const WorkerRequestKinds = {
  dbQuery: 'db.query',
  dbExecute: 'db.execute',
  dbBatch: 'db.batch',
  dbShutdown: 'db.shutdown',
  dbExportMain: 'db.exportMain',
  dbSubscribeTables: 'db.subscribeTables',
  dbUnsubscribeTables: 'db.unsubscribeTables',
  indexStatus: 'index.status',
  indexEnsureBuilt: 'index.ensureBuilt',
  readModelListWindow: 'readModel.listWindow',
  readModelGetById: 'readModel.getById',
} as const;

export type WorkerRequestKind =
  (typeof WorkerRequestKinds)[keyof typeof WorkerRequestKinds];

export type WorkerRequest =
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbQuery;
      sql: string;
      params: ReadonlyArray<SqliteValue>;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbExecute;
      sql: string;
      params: ReadonlyArray<SqliteValue>;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbBatch;
      statements: ReadonlyArray<SqliteStatement>;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbShutdown;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbExportMain;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbSubscribeTables;
      subscriptionId: string;
      tables: ReadonlyArray<string>;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.dbUnsubscribeTables;
      subscriptionId: string;
    }>
  | Readonly<{ kind: typeof WorkerRequestKinds.indexStatus; indexId: string }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.indexEnsureBuilt;
      indexId: string;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.readModelListWindow;
      readModelId: string;
      params: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      kind: typeof WorkerRequestKinds.readModelGetById;
      readModelId: string;
      id: string;
    }>;

export const WorkerResponseKinds = {
  ok: 'ok',
  error: 'error',
} as const;

export type WorkerResponseKind =
  (typeof WorkerResponseKinds)[keyof typeof WorkerResponseKinds];

export type WorkerResponse =
  | Readonly<{ kind: typeof WorkerResponseKinds.ok; data: unknown }>
  | Readonly<{ kind: typeof WorkerResponseKinds.error; error: PlatformError }>;

export const WorkerNotifyKinds = {
  tablesChanged: 'tables.changed',
} as const;

export type WorkerNotifyKind =
  (typeof WorkerNotifyKinds)[keyof typeof WorkerNotifyKinds];

export type WorkerNotify = Readonly<{
  v: 1;
  kind: typeof WorkerNotifyKinds.tablesChanged;
  tables: ReadonlyArray<string>;
}>;
