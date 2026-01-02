import type { EventBusPort, EventStorePort } from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { AggregateTypes, ProjectionOrderings, ZERO_EFFECTIVE_CURSOR } from '@mo/eventstore-core';
import { ProjectionTaskRunner } from '../projection/ProjectionTaskRunner';
import { EncryptedEventToDomainAdapter } from '../eventstore/adapters/EncryptedEventToDomainAdapter';
import { KeyringManager } from '../crypto/KeyringManager';
import { MissingKeyError } from '../errors';
import { ProjectionMetaStore } from '../platform/derived-state/stores/ProjectionMetaStore';
import { ProjectionPhases } from '../platform/derived-state/types';
import { SqliteEventStore } from '../eventstore/SqliteEventStore';

type StreamConfig = Readonly<{
  name: 'goals' | 'projects';
  eventStore: EventStorePort;
}>;

type StreamState = {
  config: StreamConfig;
  lastSequence: number;
  runner: ProjectionTaskRunner;
  projectionId: string;
  lastTrace: StreamTrace | null;
};

const META_LAST_PUBLISHED_PREFIX = 'committed_publisher';

type StreamTrace = {
  eventsCount: number;
  readMs: number;
  keyringMs: number;
  decodeMs: number;
  publishMs: number;
  metaWriteMs: number;
};

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export class CommittedEventPublisher {
  private readonly streams: StreamState[];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly metaStore: ProjectionMetaStore;
  private started = false;

  constructor(
    private readonly db: SqliteDbPort,
    private readonly eventBus: EventBusPort,
    private readonly toDomain: EncryptedEventToDomainAdapter,
    private readonly keyringManager: KeyringManager,
    configs: StreamConfig[]
  ) {
    this.metaStore = new ProjectionMetaStore(db);
    this.streams = configs.map((config) => {
      const projectionId = `${META_LAST_PUBLISHED_PREFIX}:${config.name}`;
      let stream: StreamState | null = null;
      const runner = new ProjectionTaskRunner(
        `CommittedEventPublisher:${config.name}`,
        50,
        ({ durationMs, budgetMs }) => {
          const trace = stream?.lastTrace ?? null;
          console.warn(`[CommittedEventPublisher:${config.name}] Task processing exceeded budget`, {
            durationMs,
            budgetMs,
            eventsCount: trace?.eventsCount ?? 0,
            readMs: trace?.readMs ?? 0,
            keyringMs: trace?.keyringMs ?? 0,
            decodeMs: trace?.decodeMs ?? 0,
            publishMs: trace?.publishMs ?? 0,
            metaWriteMs: trace?.metaWriteMs ?? 0,
          });
        }
      );
      stream = {
        config,
        lastSequence: 0,
        projectionId,
        runner,
        lastTrace: null,
      };
      return stream;
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const stream of this.streams) {
      stream.lastSequence = await this.loadLastSequence(stream.projectionId);
    }
    this.unsubscribers.push(
      this.db.subscribeToTables(['events'], () => {
        for (const stream of this.streams) {
          void this.processStream(stream);
        }
      })
    );
    for (const stream of this.streams) {
      await this.processStream(stream);
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }

  private async processStream(stream: StreamState): Promise<void> {
    await stream.runner.run(() => this.runProcessStream(stream));
  }

  private async runProcessStream(stream: StreamState): Promise<void> {
    const readStart = nowMs();
    const events = await stream.config.eventStore.getAllEvents({
      since: stream.lastSequence,
    });
    const readMs = nowMs() - readStart;
    if (events.length === 0) return;

    let processedMax = stream.lastSequence;
    const toPublish = [];
    let keyringMs = 0;
    let decodeMs = 0;
    for (const event of events) {
      if (!event.sequence) {
        throw new Error(`Event ${event.id} missing sequence`);
      }
      let kAggregate: Uint8Array;
      const keyStart = nowMs();
      try {
        kAggregate = await this.keyringManager.resolveKeyForEvent(event);
      } catch (err) {
        keyringMs += nowMs() - keyStart;
        if (err instanceof Error && err.message === 'Master key not set') {
          console.warn('[CommittedEventPublisher] Master key not set; deferring publish');
          return;
        }
        if (err instanceof MissingKeyError) {
          console.warn('[CommittedEventPublisher] Missing key, skipping event for aggregate', event.aggregateId);
          if (event.sequence > processedMax) {
            processedMax = event.sequence;
          }
          continue;
        }
        throw err;
      }
      keyringMs += nowMs() - keyStart;
      const decodeStart = nowMs();
      const domainEvent = await this.toDomain.toDomain(event, kAggregate);
      decodeMs += nowMs() - decodeStart;
      toPublish.push(domainEvent);
      if (event.sequence > processedMax) {
        processedMax = event.sequence;
      }
    }

    const publishStart = nowMs();
    if (toPublish.length > 0) {
      await this.eventBus.publish(toPublish);
    }
    const publishMs = nowMs() - publishStart;

    const metaStart = nowMs();
    if (processedMax > stream.lastSequence) {
      stream.lastSequence = processedMax;
      await this.saveLastSequence(stream.projectionId, processedMax);
    }
    const metaWriteMs = nowMs() - metaStart;

    stream.lastTrace = {
      eventsCount: events.length,
      readMs,
      keyringMs,
      decodeMs,
      publishMs,
      metaWriteMs,
    };
  }

  private async loadLastSequence(projectionId: string): Promise<number> {
    const record = await this.metaStore.get(projectionId);
    if (!record) {
      await this.metaStore.upsert({
        projectionId,
        ordering: ProjectionOrderings.commitSequence,
        lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
        lastCommitSequence: 0,
        phase: ProjectionPhases.idle,
        updatedAt: Date.now(),
      });
      return 0;
    }
    return record.lastCommitSequence;
  }

  private async saveLastSequence(projectionId: string, value: number): Promise<void> {
    await this.metaStore.upsert({
      projectionId,
      ordering: ProjectionOrderings.commitSequence,
      lastEffectiveCursor: ZERO_EFFECTIVE_CURSOR,
      lastCommitSequence: value,
      phase: ProjectionPhases.idle,
      updatedAt: Date.now(),
    });
  }

  static buildStreams({
    db,
    includeGoals,
    includeProjects,
  }: Readonly<{
    db: SqliteDbPort;
    includeGoals: boolean;
    includeProjects: boolean;
  }>): StreamConfig[] {
    const streams: StreamConfig[] = [];
    if (includeGoals) {
      streams.push({
        name: 'goals',
        eventStore: new SqliteEventStore(db, AggregateTypes.goal),
      });
    }
    if (includeProjects) {
      streams.push({
        name: 'projects',
        eventStore: new SqliteEventStore(db, AggregateTypes.project),
      });
    }
    return streams;
  }
}
