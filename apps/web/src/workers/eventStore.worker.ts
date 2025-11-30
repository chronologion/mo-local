/// <reference lib="webworker" />

import { WaSqliteEventStore } from '@mo/infrastructure/browser';
import type { EncryptedEvent, EventFilter } from '@mo/application';
import waSqliteWasmUrl from '@livestore/wa-sqlite/dist/wa-sqlite.wasm?url';

// type NavigatorLike = {
//   storage?: {
//     getDirectory?: () => Promise<unknown>;
//   };
// };

type InitRequest = { _tag: 'init' };
type AppendRequest = {
  _tag: 'append';
  aggregateId: string;
  events: EncryptedEvent[];
};
type GetEventsRequest = {
  _tag: 'getEvents';
  aggregateId: string;
  fromVersion?: number;
};
type GetAllEventsRequest = {
  _tag: 'getAllEvents';
  filter?: EventFilter;
};
type DebugRequest = { _tag: 'debugTables' };

type RequestPayload =
  | InitRequest
  | AppendRequest
  | GetEventsRequest
  | GetAllEventsRequest
  | DebugRequest;

type RequestMessage = {
  id: number;
  payload: RequestPayload;
};

type ResponseMessage =
  | { id: number; result: unknown }
  | { id: number; error: string };

let store: WaSqliteEventStore | null = null;
let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

const ensureStore = (): WaSqliteEventStore => {
  if (!store) throw new Error('Store not initialized');
  return store;
};

const handle = async (message: RequestMessage): Promise<ResponseMessage> => {
  const { id, payload } = message;
  try {
    switch (payload._tag) {
      case 'init': {
        if (!wasmBinaryPromise) {
          wasmBinaryPromise = fetch(waSqliteWasmUrl).then(async (res) => {
            if (!res.ok) {
              throw new Error(`Failed to load wa-sqlite wasm: ${res.status}`);
            }
            return res.arrayBuffer();
          });
        }
        const wasmBinary = await wasmBinaryPromise;
        store = await WaSqliteEventStore.initialize({
          moduleOptions: { wasmBinary },
        });
        const tables = await store.debugListTables();
        const scope = self as unknown as {
          FileSystemSyncAccessHandle?: unknown;
          navigator?: Navigator;
        };
        return {
          id,
          result: {
            vfsName: store.getVfsName(),
            tables,
            capabilities: {
              syncAccessHandle:
                typeof scope.FileSystemSyncAccessHandle !== 'undefined',
              opfs: !!scope.navigator?.storage?.getDirectory,
            },
          },
        };
      }
      case 'append': {
        const activeStore = ensureStore();
        await activeStore.append(payload.aggregateId, payload.events);
        return { id, result: null };
      }
      case 'getEvents': {
        const activeStore = ensureStore();
        const events = await activeStore.getEvents(
          payload.aggregateId,
          payload.fromVersion
        );
        return { id, result: events };
      }
      case 'getAllEvents': {
        const activeStore = ensureStore();
        const events = await activeStore.getAllEvents(payload.filter);
        return { id, result: events };
      }
      case 'debugTables': {
        const activeStore = ensureStore();
        const tables = await activeStore.debugListTables();
        return { id, result: tables };
      }
      default: {
        return { id, error: 'Unknown request' };
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected worker error';
    return { id, error: message };
  }
};

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  void handle(event.data).then((response) => {
    self.postMessage(response);
  });
};
