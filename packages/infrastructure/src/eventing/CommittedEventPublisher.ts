import type { EventBusPort, EventStorePort } from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import {
  AggregateTypes,
  ProjectionOrderings,
  ZERO_EFFECTIVE_CURSOR,
} from '@mo/eventstore-core';
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
};

const META_LAST_PUBLISHED_PREFIX = 'committed_publisher';

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
    this.streams = configs.map((config) => ({
      config,
      lastSequence: 0,
      projectionId: `${META_LAST_PUBLISHED_PREFIX}:${config.name}`,
      runner: new ProjectionTaskRunner(
        `CommittedEventPublisher:${config.name}`,
        50
      ),
    }));
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
    const events = await stream.config.eventStore.getAllEvents({
      since: stream.lastSequence,
    });
    if (events.length === 0) return;

    let processedMax = stream.lastSequence;
    const toPublish = [];
    for (const event of events) {
      if (!event.sequence) {
        throw new Error(`Event ${event.id} missing sequence`);
      }
      let kAggregate: Uint8Array;
      try {
        kAggregate = await this.keyringManager.resolveKeyForEvent(event);
      } catch (err) {
        if (err instanceof Error && err.message === 'Master key not set') {
          console.warn(
            '[CommittedEventPublisher] Master key not set; deferring publish'
          );
          return;
        }
        if (err instanceof MissingKeyError) {
          console.warn(
            '[CommittedEventPublisher] Missing key, skipping event for aggregate',
            event.aggregateId
          );
          if (event.sequence > processedMax) {
            processedMax = event.sequence;
          }
          continue;
        }
        throw err;
      }
      const domainEvent = await this.toDomain.toDomain(event, kAggregate);
      toPublish.push(domainEvent);
      if (event.sequence > processedMax) {
        processedMax = event.sequence;
      }
    }

    if (toPublish.length > 0) {
      await this.eventBus.publish(toPublish);
    }

    if (processedMax > stream.lastSequence) {
      stream.lastSequence = processedMax;
      await this.saveLastSequence(stream.projectionId, processedMax);
    }
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

  private async saveLastSequence(
    projectionId: string,
    value: number
  ): Promise<void> {
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
