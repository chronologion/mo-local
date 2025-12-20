import {
  InvalidPullError,
  InvalidPushError,
  IsOfflineError,
  ServerAheadError,
} from '@livestore/common/sync';
import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import { UnknownError } from '@livestore/common';
import {
  Effect,
  Option,
  Schema,
  Stream,
  SubscriptionRef,
  Scope,
} from '@livestore/utils/effect';

export const SyncPayloadSchema = Schema.Struct({
  apiBaseUrl: Schema.String,
});
export type SyncPayload = Schema.Schema.Type<typeof SyncPayloadSchema>;

type PullResponse = {
  events: Array<LiveStoreEvent.Global.Encoded>;
  hasMore: boolean;
  headSeqNum: number;
};

type PullResPageInfo =
  | { _tag: 'MoreUnknown' }
  | { _tag: 'MoreKnown'; remaining: number }
  | { _tag: 'NoMore' };

type PullResItem = {
  batch: ReadonlyArray<{
    eventEncoded: LiveStoreEvent.Global.Encoded;
    metadata: Option.Option<Schema.JsonValue>;
  }>;
  pageInfo: PullResPageInfo;
};

const pageInfoNoMore: PullResPageInfo = { _tag: 'NoMore' };
const pageInfoMoreKnown = (remaining: number): PullResPageInfo => ({
  _tag: 'MoreKnown',
  remaining,
});

type SyncBackendInstance = {
  isConnected: SubscriptionRef.SubscriptionRef<boolean>;
  connect: Effect.Effect<void, IsOfflineError | UnknownError, Scope.Scope>;
  pull: (
    cursor: Option.Option<{
      eventSequenceNumber: EventSequenceNumber.Global.Type;
      metadata: Option.Option<Schema.JsonValue>;
    }>,
    options?: { live?: boolean }
  ) => Stream.Stream<PullResItem, IsOfflineError | InvalidPullError>;
  push: (
    batch: ReadonlyArray<LiveStoreEvent.Global.Encoded>
  ) => Effect.Effect<void, IsOfflineError | InvalidPushError>;
  ping: Effect.Effect<void, IsOfflineError | UnknownError>;
  metadata: { name: string; description: string };
  supports: { pullPageInfoKnown: boolean; pullLive: boolean };
};

type SyncBackendConstructor<TPayload = Schema.JsonValue> = (args: {
  storeId: string;
  clientId: string;
  payload: TPayload | undefined | null;
}) => Effect.Effect<SyncBackendInstance, UnknownError, Scope.Scope>;

const defaultBaseUrl =
  (typeof globalThis !== 'undefined' &&
  typeof (globalThis as { location?: Location }).location?.origin === 'string'
    ? (globalThis as { location?: Location }).location?.origin
    : 'http://localhost:4000') ?? 'http://localhost:4000';

const buildUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

export const makeCloudSyncBackend: SyncBackendConstructor<
  Schema.JsonValue,
  Schema.JsonValue
> = ({ storeId, payload }) =>
  Effect.gen(function* () {
    const isConnected = yield* SubscriptionRef.make<boolean>(false);
    const baseUrl =
      typeof payload === 'object' &&
      payload !== null &&
      'apiBaseUrl' in payload &&
      typeof payload.apiBaseUrl === 'string'
        ? payload.apiBaseUrl
        : defaultBaseUrl;

    const normalizeSeqNum = (
      value:
        | EventSequenceNumber.Global.Type
        | { global?: number }
        | { global: number; client: number }
        | string
    ): number => {
      if (typeof value === 'number') return value;
      if (
        typeof value === 'object' &&
        value !== null &&
        'global' in value &&
        typeof (value as { global?: unknown }).global === 'number'
      ) {
        return (value as { global: number }).global;
      }
      if (typeof value === 'string') {
        // LiveStore string forms: "e1", "e1 -> e0 (...)", etc.
        const match = value.match(/e(\d+)/);
        if (match?.[1]) {
          const parsed = Number.parseInt(match[1], 10);
          if (Number.isFinite(parsed)) return parsed;
        }
        try {
          const parsed = EventSequenceNumber.Client.fromString(value);
          return parsed.global;
        } catch {
          return 0;
        }
      }
      return 0;
    };

    const toGlobalSeq = (
      value:
        | EventSequenceNumber.Global.Type
        | { global?: number }
        | { global: number; client: number }
        | string
    ): EventSequenceNumber.Global.Type => {
      return EventSequenceNumber.Global.make(normalizeSeqNum(value));
    };

    const normalizeEvent = (
      event: LiveStoreEvent.Global.Encoded
    ): LiveStoreEvent.Global.Encoded => {
      return {
        name: event.name,
        args: event.args,
        seqNum: toGlobalSeq(event.seqNum),
        parentSeqNum: toGlobalSeq(event.parentSeqNum),
        clientId: typeof event.clientId === 'string' ? event.clientId : '',
        sessionId: typeof event.sessionId === 'string' ? event.sessionId : '',
      };
    };

    const push = (batch: ReadonlyArray<LiveStoreEvent.Global.Encoded>) =>
      Effect.gen(function* () {
        const normalized = batch.map(normalizeEvent);
        yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch(buildUrl(baseUrl, '/sync/push'), {
              method: 'POST',
              credentials: 'include',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                storeId,
                events: normalized,
              }),
            });

            if (!response.ok) {
              const payloadJson = await safeParseJson(response);
              if (
                response.status === 409 &&
                typeof payloadJson === 'object' &&
                payloadJson !== null &&
                'minimumExpectedSeqNum' in payloadJson
              ) {
                const min = Number(
                  (payloadJson as { minimumExpectedSeqNum: unknown })
                    .minimumExpectedSeqNum
                );
                const provided = Number(
                  (payloadJson as { providedSeqNum?: unknown })
                    .providedSeqNum ?? 0
                );
                throw new InvalidPushError({
                  cause: new ServerAheadError({
                    minimumExpectedNum: EventSequenceNumber.Global.make(min),
                    providedNum: EventSequenceNumber.Global.make(provided),
                  }),
                });
              }
              const message =
                typeof payloadJson === 'object' && payloadJson !== null
                  ? ((payloadJson as { message?: string }).message ??
                    `Sync push failed with status ${response.status}`)
                  : `Sync push failed with status ${response.status}`;
              throw new InvalidPushError({
                cause: new UnknownError({ cause: new Error(message) }),
              });
            }
          },
          catch: (error) => {
            // Preserve protocol-level errors so the sync processor can
            // distinguish between "offline" and "bad request/auth".
            if (error instanceof InvalidPushError) {
              return error;
            }
            return new IsOfflineError({
              cause: new UnknownError({
                cause:
                  error instanceof Error ? error : new Error(String(error)),
              }),
            });
          },
        });
        yield* SubscriptionRef.set(isConnected, true);
      });

    const pull = (
      cursor: Option.Option<{
        eventSequenceNumber: EventSequenceNumber.Global.Type;
        metadata: Option.Option<Schema.JsonValue>;
      }>,
      // We currently ignore the `live` flag and always perform a single-page pull.
      // Live streaming can be added later while keeping this signature.
      _options?: { live?: boolean }
    ) => {
      const since = cursor.pipe(
        Option.match({
          onNone: () => 0,
          onSome: (value) => value.eventSequenceNumber,
        })
      );

      const url = new URL(buildUrl(baseUrl, '/sync/pull'));
      url.searchParams.set('storeId', storeId);
      url.searchParams.set('since', String(since));
      url.searchParams.set('limit', String(100));

      const effect = Effect.gen(function* () {
        const data = yield* Effect.tryPromise({
          try: async (): Promise<PullResponse> => {
            const response = await fetch(url.toString(), {
              method: 'GET',
              credentials: 'include',
            });
            if (!response.ok) {
              const payloadJson = await safeParseJson(response);
              const message =
                typeof payloadJson === 'object' && payloadJson !== null
                  ? ((payloadJson as { message?: string }).message ??
                    `Sync pull failed with status ${response.status}`)
                  : `Sync pull failed with status ${response.status}`;
              throw new InvalidPullError({
                cause: new UnknownError({ cause: new Error(message) }),
              });
            }
            const parsed = (await response.json()) as PullResponse;
            return parsed;
          },
          catch: (error) => {
            if (error instanceof InvalidPullError) {
              return error;
            }
            return new IsOfflineError({
              cause: new UnknownError({
                cause:
                  error instanceof Error ? error : new Error(String(error)),
              }),
            });
          },
        });
        yield* SubscriptionRef.set(isConnected, true);
        return {
          batch: data.events.map((eventEncoded) => ({
            eventEncoded,
            metadata: Option.none<Schema.JsonValue>(),
          })),
          pageInfo: data.hasMore ? pageInfoMoreKnown(1) : pageInfoNoMore,
        };
      });

      return Stream.fromEffect(effect);
    };

    const ping = Effect.gen(function* () {
      const url = new URL(buildUrl(baseUrl, '/sync/pull'));
      url.searchParams.set('storeId', storeId);
      url.searchParams.set('since', '0');
      url.searchParams.set('limit', '1');

      yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
          });
          if (!response.ok) {
            throw new Error(`Sync ping failed with status ${response.status}`);
          }
        },
        catch: (error) =>
          new IsOfflineError({
            cause: new UnknownError({
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
          }),
      });

      yield* SubscriptionRef.set(isConnected, true);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* SubscriptionRef.set(isConnected, false);
          return yield* Effect.fail(error);
        })
      )
    );

    const connect = ping;

    const backend: SyncBackendInstance = {
      isConnected,
      connect,
      pull,
      push,
      ping,
      metadata: {
        name: '@mo/sync-cloud',
        description: 'HTTP sync backend for mo-local via /sync endpoints',
      },
      supports: {
        pullPageInfoKnown: true,
        pullLive: false,
      },
    };

    return backend;
  });
