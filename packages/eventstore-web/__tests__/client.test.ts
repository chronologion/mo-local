import { describe, expect, it, vi, afterEach } from 'vitest';
import { DbClient, sendHello, type MessagePortLike } from '../src/client';
import {
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerNotifyKinds,
  WorkerRequestKinds,
  WorkerResponseKinds,
  type WorkerEnvelope,
  type WorkerHello,
} from '../src/protocol/types';
import { PlatformErrorCodes } from '@mo/eventstore-core';

type PostedMessage = {
  message: unknown;
  transfer?: Transferable[];
};

class TestPort implements MessagePortLike {
  private readonly listeners = new Set<(event: MessageEvent) => void>();
  readonly posted: PostedMessage[] = [];

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void
  ): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void
  ): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  emit(data: unknown): void {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DbClient', () => {
  it('resolves query responses', async () => {
    const port = new TestPort();
    const client = new DbClient(port);
    const promise = client.query<{ id: number }>('SELECT 1');
    const envelope = port.posted[0]?.message as WorkerEnvelope;
    expect(envelope.kind).toBe(WorkerEnvelopeKinds.request);
    const requestEnvelope = envelope as Extract<
      WorkerEnvelope,
      { kind: typeof WorkerEnvelopeKinds.request }
    >;
    expect(requestEnvelope.payload.kind).toBe(WorkerRequestKinds.dbQuery);

    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: { kind: WorkerResponseKinds.ok, data: [{ id: 1 }] },
    });

    await expect(promise).resolves.toEqual([{ id: 1 }]);
    client.shutdown();
  });

  it('rejects on error responses', async () => {
    const port = new TestPort();
    const client = new DbClient(port);
    const promise = client.execute('DELETE FROM events');
    const envelope = port.posted[0]?.message as WorkerEnvelope;

    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: {
        kind: WorkerResponseKinds.error,
        error: { code: PlatformErrorCodes.DbLockedError, message: 'locked' },
      },
    });

    await expect(promise).rejects.toMatchObject({
      name: PlatformErrorCodes.DbLockedError,
      code: PlatformErrorCodes.DbLockedError,
      message: 'locked',
    });
    client.shutdown();
  });

  it('collects transferables for Uint8Array params', async () => {
    const port = new TestPort();
    const client = new DbClient(port);
    const payload = new Uint8Array([1, 2, 3]);
    const promise = client.query('SELECT ?', [payload]);
    const envelope = port.posted[0]?.message as WorkerEnvelope;
    expect(port.posted[0]?.transfer).toContain(payload.buffer);
    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: { kind: WorkerResponseKinds.ok, data: [] },
    });
    await expect(promise).resolves.toEqual([]);
    client.shutdown();
  });

  it('notifies subscribers for matching tables', async () => {
    const port = new TestPort();
    const client = new DbClient(port);
    const listener = vi.fn();
    const unsubscribe = client.subscribeToTables(['Events'], listener);
    const subscribeEnvelope = port.posted[0]?.message as WorkerEnvelope;
    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: subscribeEnvelope.requestId,
      payload: { kind: WorkerResponseKinds.ok, data: null },
    });

    port.emit({
      v: 1,
      kind: WorkerNotifyKinds.tablesChanged,
      tables: ['events'],
    });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    const unsubscribeEnvelope = port.posted[1]?.message as WorkerEnvelope;
    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: unsubscribeEnvelope.requestId,
      payload: { kind: WorkerResponseKinds.ok, data: null },
    });

    port.emit({
      v: 1,
      kind: WorkerNotifyKinds.tablesChanged,
      tables: ['events'],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    client.shutdown();
  });
});

describe('sendHello', () => {
  it('resolves on hello ok', async () => {
    const port = new TestPort();
    const promise = sendHello(port, {
      v: 1,
      kind: WorkerHelloKinds.hello,
      storeId: 'store',
      clientInstanceId: 'client',
      dbName: 'db',
      requireOpfs: true,
    });
    const posted = port.posted[0]?.message as WorkerHello;
    expect(posted.kind).toBe(WorkerHelloKinds.hello);

    const response: Extract<
      WorkerHello,
      { kind: typeof WorkerHelloKinds.helloOk }
    > = {
      v: 1,
      kind: WorkerHelloKinds.helloOk,
      protocolVersion: 1,
      ownershipMode: { type: 'mainThread', singleTabOnly: true },
      serverInstanceId: 'server',
    };
    port.emit(response);

    await expect(promise).resolves.toEqual(response);
  });

  it('rejects on timeout', async () => {
    vi.useFakeTimers();
    const port = new TestPort();
    const promise = sendHello(
      port,
      {
        v: 1,
        kind: WorkerHelloKinds.hello,
        storeId: 'store',
        clientInstanceId: 'client',
        dbName: 'db',
        requireOpfs: false,
      },
      5
    );
    const rejection = expect(promise).rejects.toThrow('Worker hello timeout');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });
});
