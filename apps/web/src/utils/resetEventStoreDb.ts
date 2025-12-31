const isNotFoundError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'NotFoundError';

const removeEntryIfExists = async (
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<void> => {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
};

type DirectoryAsyncIterable = FileSystemDirectoryHandle &
  AsyncIterable<readonly [string, FileSystemHandle]>;

const isAsyncIterableDirectory = (
  dir: FileSystemDirectoryHandle
): dir is DirectoryAsyncIterable => {
  const iterator = (
    dir as FileSystemDirectoryHandle & { [Symbol.asyncIterator]?: unknown }
  )[Symbol.asyncIterator];
  return typeof iterator === 'function';
};

export const wipeEventStoreDb = async (storeId: string): Promise<void> => {
  if (typeof navigator === 'undefined') return;
  if (!('storage' in navigator) || !navigator.storage.getDirectory) return;

  const root = await navigator.storage.getDirectory();
  const dbName = `mo-eventstore-${storeId}.db`;
  const vfsDir = `mo-eventstore-${storeId}`;

  await removeEntryIfExists(root, dbName);
  await removeEntryIfExists(root, vfsDir);
};

/**
 * DEV-only convenience: remove all OPFS artifacts left by this app, including
 * historical storeIds and legacy LiveStore directories.
 */
export const wipeAllMoLocalOpfs = async (): Promise<void> => {
  if (typeof navigator === 'undefined') return;
  if (!('storage' in navigator) || !navigator.storage.getDirectory) return;

  const root = await navigator.storage.getDirectory();
  if (!isAsyncIterableDirectory(root)) {
    return;
  }

  const entries: Array<readonly [string, FileSystemHandle]> = [];
  for await (const entry of root) {
    entries.push(entry);
  }

  const shouldRemove = (name: string): boolean =>
    name.startsWith('mo-eventstore-') ||
    name.startsWith('livestore-') ||
    name.startsWith('livestore-mo-local');

  for (const [name] of entries) {
    if (!shouldRemove(name)) continue;
    await removeEntryIfExists(root, name);
  }
};
