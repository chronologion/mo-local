import type { IEventBus } from '@mo/application';
import type { Store } from '@livestore/livestore';
import type { BrowserLiveStoreEventStore } from '../browser/LiveStoreEventStore';
import type { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { ProjectionTaskRunner } from '../projection/ProjectionTaskRunner';
import { tables } from '../livestore/schema';
import { KeyringManager } from '../crypto/KeyringManager';
import { MissingKeyError } from '../errors';

type CountQuery = () =>
  | ReturnType<typeof tables.goal_events.count>
  | ReturnType<typeof tables.project_events.count>;

type StreamConfig = Readonly<{
  name: 'goals' | 'projects';
  eventStore: BrowserLiveStoreEventStore;
  metaTable: 'goal_projection_meta' | 'project_projection_meta';
  countQuery: CountQuery;
}>;

type StreamState = {
  config: StreamConfig;
  lastSequence: number;
  runner: ProjectionTaskRunner;
};

const META_LAST_PUBLISHED_KEY = 'last_published_sequence';

export class CommittedEventPublisher {
  private readonly streams: StreamState[];
  private readonly unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(
    private readonly store: Store,
    private readonly eventBus: IEventBus,
    private readonly toDomain: LiveStoreToDomainAdapter,
    private readonly keyringManager: KeyringManager,
    configs: StreamConfig[]
  ) {
    this.streams = configs.map((config) => ({
      config,
      lastSequence: 0,
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
      stream.lastSequence = await this.loadLastSequence(
        stream.config.metaTable
      );
      this.unsubscribers.push(
        this.store.subscribe(stream.config.countQuery(), () => {
          void this.processStream(stream);
        })
      );
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
      await this.saveLastSequence(stream.config.metaTable, processedMax);
    }
  }

  private async loadLastSequence(metaTable: StreamConfig['metaTable']) {
    const rows = this.store.query<{ value: string }[]>({
      query: `SELECT value FROM ${metaTable} WHERE key = ?`,
      bindValues: [META_LAST_PUBLISHED_KEY],
    });
    const value = rows[0]?.value;
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async saveLastSequence(
    metaTable: StreamConfig['metaTable'],
    value: number
  ) {
    this.store.query({
      query: `
        INSERT INTO ${metaTable} (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [META_LAST_PUBLISHED_KEY, String(value)],
    });
  }

  static buildStreams({
    goalEventStore,
    projectEventStore,
  }: Readonly<{
    goalEventStore?: BrowserLiveStoreEventStore;
    projectEventStore?: BrowserLiveStoreEventStore;
  }>): StreamConfig[] {
    const streams: StreamConfig[] = [];
    if (goalEventStore) {
      streams.push({
        name: 'goals',
        eventStore: goalEventStore,
        metaTable: 'goal_projection_meta',
        countQuery: () => tables.goal_events.count(),
      });
    }
    if (projectEventStore) {
      streams.push({
        name: 'projects',
        eventStore: projectEventStore,
        metaTable: 'project_projection_meta',
        countQuery: () => tables.project_events.count(),
      });
    }
    return streams;
  }
}
