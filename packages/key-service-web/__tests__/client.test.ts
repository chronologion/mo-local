import { describe, expect, it } from 'vitest';
import { KeyServiceClient } from '../src/client';
import {
  WorkerEnvelopeKinds,
  WorkerResponseKinds,
  type KeyHandle,
  type KeyServiceRequest,
  type SessionId,
  type WorkerEnvelope,
} from '../src/protocol/types';

type PostedMessage = {
  message: unknown;
  transfer?: Transferable[];
};

class TestPort {
  private readonly listeners = new Set<(event: MessageEvent) => void>();
  readonly posted: PostedMessage[] = [];

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void {
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

const toSessionId = (value: string): SessionId => {
  if (value.length === 0) {
    throw new Error('session id required');
  }
  return value as SessionId;
};

const toKeyHandle = (value: string): KeyHandle => {
  if (value.length === 0) {
    throw new Error('key handle required');
  }
  return value as KeyHandle;
};

describe('KeyServiceClient', () => {
  it('resolves ok responses', async () => {
    const port = new TestPort();
    const client = new KeyServiceClient(port);
    const request: KeyServiceRequest = { type: 'lock', payload: { sessionId: toSessionId('session-1') } };
    const promise = client.request(request);
    const envelope = port.posted[0]?.message as WorkerEnvelope;

    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: {
        kind: WorkerResponseKinds.ok,
        data: { type: 'lock', payload: {} },
      },
    });

    await expect(promise).resolves.toEqual({ type: 'lock', payload: {} });
    client.shutdown();
  });

  it('rejects error responses', async () => {
    const port = new TestPort();
    const client = new KeyServiceClient(port);
    const request: KeyServiceRequest = { type: 'lock', payload: { sessionId: toSessionId('session-2') } };
    const promise = client.request(request);
    const envelope = port.posted[0]?.message as WorkerEnvelope;

    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: {
        kind: WorkerResponseKinds.error,
        error: { code: 'SessionInvalid', message: 'bad session' },
      },
    });

    await expect(promise).rejects.toMatchObject({
      name: 'SessionInvalid',
      code: 'SessionInvalid',
      message: 'bad session',
    });
    client.shutdown();
  });

  it('collects transferables for Uint8Array payloads', async () => {
    const port = new TestPort();
    const client = new KeyServiceClient(port);
    const sessionId = toSessionId('session-3');
    const ciphertext = new Uint8Array([1, 2, 3]);
    const request: KeyServiceRequest = {
      type: 'decrypt',
      payload: {
        sessionId,
        resourceKeyHandle: toKeyHandle('handle-1'),
        aad: new Uint8Array([4, 5]),
        ciphertext,
      },
    };

    const promise = client.request(request);
    const envelope = port.posted[0]?.message as WorkerEnvelope;
    expect(port.posted[0]?.transfer).toContain(ciphertext.buffer);

    port.emit({
      v: 1,
      kind: WorkerEnvelopeKinds.response,
      requestId: envelope.requestId,
      payload: {
        kind: WorkerResponseKinds.ok,
        data: { type: 'decrypt', payload: { plaintext: new Uint8Array([9]) } },
      },
    });

    await expect(promise).resolves.toEqual({ type: 'decrypt', payload: { plaintext: new Uint8Array([9]) } });
    client.shutdown();
  });
});
