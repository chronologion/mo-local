import type { EncryptedEvent, EventFilter, IEventStore } from '@mo/application';

type WorkerRequestPayload =
  | { _tag: 'init' }
  | { _tag: 'append'; aggregateId: string; events: EncryptedEvent[] }
  | { _tag: 'getEvents'; aggregateId: string; fromVersion?: number }
  | { _tag: 'getAllEvents'; filter?: EventFilter }
  | { _tag: 'debugTables' };

type WorkerRequest = {
  id: number;
  payload: WorkerRequestPayload;
};

type WorkerResponse =
  | { id: number; result: unknown }
  | { id: number; error: string };

type InitResult = {
  vfsName: string;
  tables: string[];
  capabilities?: { syncAccessHandle: boolean; opfs: boolean };
};

export class WorkerEventStore implements IEventStore {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const callbacks = this.pending.get(message.id);
      if (!callbacks) return;
      this.pending.delete(message.id);
      if ('error' in message) {
        callbacks.reject(new Error(message.error));
        return;
      }
      callbacks.resolve(message.result);
    };
  }

  static async create(): Promise<{
    store: WorkerEventStore;
    debug: InitResult;
  }> {
    const worker = new Worker(
      new URL('../workers/eventStore.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const client = new WorkerEventStore(worker);
    const debug = (await client.call({
      _tag: 'init',
    })) as InitResult;
    return { store: client, debug };
  }

  async append(aggregateId: string, events: EncryptedEvent[]): Promise<void> {
    await this.call({ _tag: 'append', aggregateId, events });
  }

  async getEvents(
    aggregateId: string,
    fromVersion = 1
  ): Promise<EncryptedEvent[]> {
    const result = await this.call({
      _tag: 'getEvents',
      aggregateId,
      fromVersion,
    });
    return result as EncryptedEvent[];
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    const result = await this.call({ _tag: 'getAllEvents', filter });
    return result as EncryptedEvent[];
  }

  async debugTables(): Promise<string[]> {
    const result = await this.call({ _tag: 'debugTables' });
    return result as string[];
  }

  async dispose(): Promise<void> {
    this.worker.terminate();
  }

  private call(payload: WorkerRequestPayload): Promise<unknown> {
    const id = this.nextId++;
    const message: WorkerRequest = { id, payload };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(message);
    });
  }
}
