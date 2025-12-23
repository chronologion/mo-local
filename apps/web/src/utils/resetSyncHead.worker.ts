import { liveStoreStorageFormatVersion } from '@livestore/common';
import { loadSqlite3Wasm } from '@livestore/sqlite-wasm/load-wasm';
import { sqliteDbFactory } from '@livestore/sqlite-wasm/browser';
import { Effect } from '@livestore/utils/effect';
import { Opfs } from '@livestore/utils/effect/browser';
import { resetEventlogSyncStatus } from './resetSyncHeadEventlog';

type ResetSyncHeadRequest = {
  type: 'reset-sync-head';
  storeId: string;
};

type ResetSyncHeadResult =
  | { type: 'reset-sync-head-result'; ok: true }
  | { type: 'reset-sync-head-result'; ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isResetSyncHeadRequest = (
  value: unknown
): value is ResetSyncHeadRequest => {
  if (!isRecord(value)) return false;
  if (value.type !== 'reset-sync-head') return false;
  return typeof value.storeId === 'string' && value.storeId.length > 0;
};

const postResult = (result: ResetSyncHeadResult): void => {
  globalThis.postMessage(result);
};

const listEntries = async (
  dir: FileSystemDirectoryHandle
): Promise<Array<[string, FileSystemHandle]>> => {
  const results: Array<[string, FileSystemHandle]> = [];
  const entries = (
    dir as unknown as {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries();
  for await (const entry of entries) {
    results.push(entry);
  }
  return results;
};

const findOpfsDirectoryForStore = async (
  storeId: string
): Promise<string | null> => {
  const defaultDir = `livestore-${storeId}@${liveStoreStorageFormatVersion}`;
  const root = await navigator.storage.getDirectory();
  try {
    await root.getDirectoryHandle(defaultDir);
    return defaultDir;
  } catch {
    // Fall back to scanning for older/newer storage format versions.
  }
  const prefix = `livestore-${storeId}@`;
  const entries = await listEntries(root);
  const candidates = entries
    .filter(
      ([name, handle]) => handle.kind === 'directory' && name.startsWith(prefix)
    )
    .map(([name]) => name);
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1] ?? null;
};

const runReset = async (storeId: string): Promise<void> => {
  const opfsDirectory = await findOpfsDirectoryForStore(storeId);
  if (!opfsDirectory) {
    throw new Error(
      `OPFS directory for storeId ${storeId} not found (expected prefix livestore-${storeId}@...)`
    );
  }

  const sqlite3 = await loadSqlite3Wasm();
  const makeSqliteDb = sqliteDbFactory({ sqlite3 });

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const eventlogDb = yield* makeSqliteDb({
          _tag: 'opfs',
          opfsDirectory,
          fileName: 'eventlog.db',
        }).pipe(Effect.provide(Opfs.Opfs.Default));
        yield* Effect.try(() => resetEventlogSyncStatus(eventlogDb));
      })
    )
  );
};

globalThis.addEventListener('message', (event: MessageEvent) => {
  const data: unknown = event.data;
  if (!isResetSyncHeadRequest(data)) return;
  void (async () => {
    try {
      await runReset(data.storeId);
      postResult({ type: 'reset-sync-head-result', ok: true });
    } catch (error) {
      postResult({
        type: 'reset-sync-head-result',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
