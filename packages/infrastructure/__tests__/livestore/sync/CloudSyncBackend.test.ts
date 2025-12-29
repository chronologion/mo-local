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

const asSeq = (value: number): LiveStoreEvent.Global.Encoded['seqNum'] =>
  value as LiveStoreEvent.Global.Encoded['seqNum'];

const sampleEvent = (seqNum: number): LiveStoreEvent.Global.Encoded => ({
  name: 'sample.event',
  args: { value: seqNum },
  seqNum: asSeq(seqNum),
  parentSeqNum: asSeq(Math.max(0, seqNum - 1)),
  clientId: 'client-1',
  sessionId: 'session-1',
});

describe('CloudSyncBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // In Node 22+, BroadcastChannel exists; in these unit tests we want the
    // backend to default to "sync enabled" without cross-context signaling.
    vi.stubGlobal(
      'BroadcastChannel',
      undefined as unknown as typeof BroadcastChannel
    );
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

    const connected = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backend = yield* makeCloudSyncBackend({
            storeId: 'store-1',
            clientId: 'client-1',
            payload: { apiBaseUrl: 'http://api.example.com' },
          });

          yield* backend.push([sampleEvent(1)]);
          return yield* SubscriptionRef.get(backend.isConnected);
        })
      )
    );

    expect(fetchMock).toHaveBeenCalledWith(
      pushUrl,
      expect.objectContaining({
        method: 'POST',
      })
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

    const collected = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backend = yield* makeCloudSyncBackend({
            storeId: 'store-1',
            clientId: 'client-1',
            payload: { apiBaseUrl: 'http://api.example.com' },
          });

          const pullStream = backend.pull(Option.none());
          return yield* Stream.runCollectReadonlyArray(pullStream);
        })
      )
    );
    const firstBatch = collected[0]?.batch ?? [];

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(pullUrl),
      expect.objectContaining({ method: 'GET' })
    );
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0]?.eventEncoded.seqNum).toBe(1);
  });

  it('maps server-ahead conflicts to InvalidPushError(ServerAheadError)', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Server ahead',
          minimumExpectedSeqNum: 5,
          providedSeqNum: 3,
        }),
        { status: 409 }
      )
    );

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backend = yield* makeCloudSyncBackend({
            storeId: 'store-1',
            clientId: 'client-1',
            payload: { apiBaseUrl: 'http://api.example.com' },
          });

          return yield* Effect.either(backend.push([sampleEvent(3)]));
        })
      )
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toMatchObject({
        cause: { _tag: 'ServerAheadError' },
      });
    }
  });

  it('treats unauthorized push as offline to allow retry', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backend = yield* makeCloudSyncBackend({
            storeId: 'store-1',
            clientId: 'client-1',
            payload: { apiBaseUrl: 'http://api.example.com' },
          });

          return yield* Effect.either(backend.push([sampleEvent(1)]));
        })
      )
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('IsOfflineError');
    }
  });

  it('treats unauthorized pull as offline to allow retry', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const backend = yield* makeCloudSyncBackend({
            storeId: 'store-1',
            clientId: 'client-1',
            payload: { apiBaseUrl: 'http://api.example.com' },
          });

          return yield* Effect.either(
            Stream.runCollectReadonlyArray(backend.pull(Option.none()))
          );
        })
      )
    );

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('IsOfflineError');
    }
  });
});
