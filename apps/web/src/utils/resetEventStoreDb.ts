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

export const wipeEventStoreDb = async (storeId: string): Promise<void> => {
  if (typeof navigator === 'undefined') return;
  if (!('storage' in navigator) || !navigator.storage.getDirectory) return;

  const root = await navigator.storage.getDirectory();
  const dbName = `mo-eventstore-${storeId}.db`;
  const vfsDir = `mo-eventstore-${storeId}`;

  await removeEntryIfExists(root, dbName);
  await removeEntryIfExists(root, vfsDir);
};
