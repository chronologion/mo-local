export const resetSyncHeadInOpfs = async (
  storeId: string
): Promise<boolean> => {
  const ResetWorker = (await import('./resetSyncHead.worker?worker')).default;
  console.info('[reseed] resetSyncHeadInOpfs:start', { storeId });
  return await new Promise<boolean>((resolve, reject) => {
    const worker = new ResetWorker();
    const teardown = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
    };

    const onError = (event: ErrorEvent) => {
      teardown();
      console.error(
        '[reseed] resetSyncHeadInOpfs:worker-error',
        event.error ?? event.message
      );
      reject(event.error ?? new Error(event.message));
    };

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      const record = data as Record<string, unknown>;
      if (record.type !== 'reset-sync-head-result') return;
      teardown();
      if (record.ok === true) {
        console.info('[reseed] resetSyncHeadInOpfs:ok', { storeId });
        resolve(true);
        return;
      }
      const message =
        typeof record.error === 'string'
          ? record.error
          : 'Failed to reset sync head';
      console.warn('[reseed] resetSyncHeadInOpfs:failed', { storeId, message });
      resolve(false);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'reset-sync-head', storeId });
  });
};
