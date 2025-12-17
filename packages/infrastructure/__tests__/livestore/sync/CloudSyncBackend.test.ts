import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  Effect,
  Option,
  Stream,
  SubscriptionRef,
} from '@livestore/utils/effect';
import type { LiveStoreEvent } from '@livestore/common/schema';
import { makeCloudSyncBackend } from '../../../src/livestore/sync/CloudSyncBackend';

const pushUrl = 'http://api.example.com/sync/push';
const pullUrl = 'http://api.example.com/sync/pull';

const sampleEvent = (seqNum: number): LiveStoreEvent.Global.Encoded => ({
  name: 'sample.event',
  args: { value: seqNum },
  seqNum: `e${seqNum}`,
  parentSeqNum: `e${Math.max(0, seqNum - 1)}`,
  clientId: 'client-1',
  sessionId: 'session-1',
});

describe('CloudSyncBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pushes a batch successfully and marks connection as up', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const backend = await Effect.runPromise(
      makeCloudSyncBackend({
        storeId: 'store-1',
        clientId: 'client-1',
        payload: { apiBaseUrl: 'http://api.example.com' },
      })
    );

    await Effect.runPromise(backend.push([sampleEvent(1)]));

    expect(fetchMock).toHaveBeenCalledWith(
      pushUrl,
      expect.objectContaining({
        method: 'POST',
      })
    );

    const connected = await Effect.runPromise(
      SubscriptionRef.get(backend.isConnected)
    );
    expect(connected).toBe(true);
  });

  it('pulls events and returns them in a stream', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          events: [sampleEvent(1)],
          hasMore: false,
          headSeqNum: 1,
        }),
        { status: 200 }
      )
    );

    const backend = await Effect.runPromise(
      makeCloudSyncBackend({
        storeId: 'store-1',
        clientId: 'client-1',
        payload: { apiBaseUrl: 'http://api.example.com' },
      })
    );

    const pullStream = backend.pull(Option.none());
    const collected = await Effect.runPromise(
      Stream.runCollectReadonlyArray(pullStream)
    );
    const firstBatch = collected[0]?.batch ?? [];

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(pullUrl),
      expect.objectContaining({ method: 'GET' })
    );
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0]?.eventEncoded.seqNum).toBe('e1');
  });
});
