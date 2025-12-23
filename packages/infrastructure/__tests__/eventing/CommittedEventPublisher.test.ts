import { describe, expect, it } from 'vitest';
import type { Store } from '@livestore/livestore';
import {
  GoalCreated,
  GoalId,
  Month,
  Priority,
  Slice,
  Summary,
  Timestamp,
  UserId,
  ProjectCreated,
  ProjectId,
  ProjectName,
  ProjectStatus,
  LocalDate,
  ProjectDescription,
} from '@mo/domain';
import type { EncryptedEvent, EventFilter, IEventStore } from '@mo/application';
import type { DomainEvent } from '@mo/domain';
import { CommittedEventPublisher } from '../../src/eventing/CommittedEventPublisher';
import { DomainToLiveStoreAdapter } from '../../src/livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../../src/livestore/adapters/LiveStoreToDomainAdapter';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';

class EventStoreStub implements IEventStore {
  constructor(private readonly events: EncryptedEvent[]) {}

  async append(): Promise<void> {
    throw new Error('append not supported in stub');
  }

  async getEvents(): Promise<EncryptedEvent[]> {
    return this.events;
  }

  async getAllEvents(filter?: EventFilter): Promise<EncryptedEvent[]> {
    if (!filter?.since) return this.events;
    return this.events.filter(
      (event) => (event.sequence ?? 0) > (filter.since ?? 0)
    );
  }
}

class StoreStub {
  private readonly meta = new Map<string, Map<string, string>>();
  private readonly subscribers: Array<() => void> = [];

  subscribe(_query: unknown, cb: () => void): () => void {
    this.subscribers.push(cb);
    return () => {};
  }

  query<TResult>({
    query,
    bindValues,
  }: {
    query: string;
    bindValues: Array<string | number>;
  }): TResult {
    if (query.includes('FROM goal_projection_meta')) {
      return this.readMeta('goal_projection_meta', bindValues) as TResult;
    }
    if (query.includes('FROM project_projection_meta')) {
      return this.readMeta('project_projection_meta', bindValues) as TResult;
    }
    if (query.includes('INSERT INTO goal_projection_meta')) {
      this.writeMeta('goal_projection_meta', bindValues);
      return [] as TResult;
    }
    if (query.includes('INSERT INTO project_projection_meta')) {
      this.writeMeta('project_projection_meta', bindValues);
      return [] as TResult;
    }
    throw new Error(`Unhandled query: ${query}`);
  }

  readMeta(
    table: 'goal_projection_meta' | 'project_projection_meta',
    bindValues: Array<string | number>
  ) {
    const key = bindValues[0] as string;
    const tableMap = this.meta.get(table);
    const value = tableMap?.get(key);
    return value ? [{ value }] : [];
  }

  writeMeta(
    table: 'goal_projection_meta' | 'project_projection_meta',
    bindValues: Array<string | number>
  ) {
    const key = bindValues[0] as string;
    const value = bindValues[1] as string;
    const tableMap = this.meta.get(table) ?? new Map<string, string>();
    tableMap.set(key, value);
    this.meta.set(table, tableMap);
  }
}

class EventBusStub {
  private readonly published: DomainEvent[] = [];
  subscribe(): void {
    // no-op for tests
  }
  async publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
  getPublished(): DomainEvent[] {
    return this.published;
  }
}

const crypto = new NodeCryptoService();
const toEncrypted = new DomainToLiveStoreAdapter(crypto);
const toDomain = new LiveStoreToDomainAdapter(crypto);

const buildGoalCreated = () =>
  new GoalCreated({
    goalId: GoalId.from('00000000-0000-0000-0000-000000000501'),
    slice: Slice.from('Health'),
    summary: Summary.from('Commit publisher'),
    targetMonth: Month.from('2026-01'),
    priority: Priority.from('must'),
    createdBy: UserId.from('user-1'),
    createdAt: Timestamp.fromMillis(Date.now()),
  });

const buildProjectCreated = () =>
  new ProjectCreated({
    projectId: ProjectId.from('00000000-0000-0000-0000-000000000601'),
    name: ProjectName.from('Publisher'),
    status: ProjectStatus.from('planned'),
    startDate: LocalDate.fromString('2025-01-01'),
    targetDate: LocalDate.fromString('2025-02-01'),
    description: ProjectDescription.from('Test'),
    goalId: null,
    createdBy: UserId.from('user-1'),
    createdAt: Timestamp.fromMillis(Date.now()),
  });

const buildEncrypted = async (
  event:
    | ReturnType<typeof buildGoalCreated>
    | ReturnType<typeof buildProjectCreated>,
  version: number,
  key: Uint8Array
): Promise<EncryptedEvent> => {
  const encrypted = await toEncrypted.toEncrypted(event, version, key);
  return { ...encrypted, sequence: version };
};

describe('CommittedEventPublisher', () => {
  it('publishes events from the stream', async () => {
    const store = new StoreStub();
    const bus = new EventBusStub();
    const keyStore = new InMemoryKeyStore();
    const key = new Uint8Array(32).fill(1);
    const event = buildGoalCreated();
    await keyStore.saveAggregateKey(event.aggregateId.value, key);
    const encrypted = await buildEncrypted(event, 1, key);
    const eventStore = new EventStoreStub([encrypted]);

    const publisher = new CommittedEventPublisher(
      store as unknown as Store,
      bus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({ goalEventStore: eventStore })
    );

    await publisher.start();

    expect(bus.getPublished().map((e) => e.eventType)).toEqual(['GoalCreated']);
  });

  it('persists last sequence and resumes from it', async () => {
    const store = new StoreStub();
    const keyStore = new InMemoryKeyStore();
    const key = new Uint8Array(32).fill(2);
    const event = buildGoalCreated();
    await keyStore.saveAggregateKey(event.aggregateId.value, key);
    const encrypted = await buildEncrypted(event, 1, key);
    const eventStore = new EventStoreStub([encrypted]);

    const firstBus = new EventBusStub();
    const first = new CommittedEventPublisher(
      store as unknown as Store,
      firstBus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({ goalEventStore: eventStore })
    );
    await first.start();
    expect(firstBus.getPublished().length).toBe(1);

    const secondBus = new EventBusStub();
    const second = new CommittedEventPublisher(
      store as unknown as Store,
      secondBus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({ goalEventStore: eventStore })
    );
    await second.start();
    expect(secondBus.getPublished().length).toBe(0);
  });

  it('skips missing keys and still advances sequence', async () => {
    const store = new StoreStub();
    const bus = new EventBusStub();
    const keyStore = new InMemoryKeyStore();
    const key = new Uint8Array(32).fill(3);
    const event = buildGoalCreated();
    const encrypted = await buildEncrypted(event, 5, key);
    const eventStore = new EventStoreStub([encrypted]);

    const publisher = new CommittedEventPublisher(
      store as unknown as Store,
      bus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({ goalEventStore: eventStore })
    );

    await publisher.start();
    expect(bus.getPublished().length).toBe(0);

    const rows = store.query<{ value: string }[]>({
      query: 'SELECT value FROM goal_projection_meta WHERE key = ?',
      bindValues: ['last_published_sequence'],
    });
    expect(rows[0]?.value).toBe('5');
  });

  it('no-ops on empty streams', async () => {
    const store = new StoreStub();
    const bus = new EventBusStub();
    const keyStore = new InMemoryKeyStore();
    const eventStore = new EventStoreStub([]);

    const publisher = new CommittedEventPublisher(
      store as unknown as Store,
      bus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({ goalEventStore: eventStore })
    );

    await publisher.start();
    expect(bus.getPublished().length).toBe(0);
  });

  it('processes multiple streams independently', async () => {
    const store = new StoreStub();
    const bus = new EventBusStub();
    const keyStore = new InMemoryKeyStore();
    const keyA = new Uint8Array(32).fill(4);
    const keyB = new Uint8Array(32).fill(5);

    const goalEvent = buildGoalCreated();
    const projectEvent = buildProjectCreated();
    await keyStore.saveAggregateKey(goalEvent.aggregateId.value, keyA);
    await keyStore.saveAggregateKey(projectEvent.aggregateId.value, keyB);

    const goalEncrypted = await buildEncrypted(goalEvent, 1, keyA);
    const projectEncrypted = await buildEncrypted(projectEvent, 2, keyB);

    const goalStore = new EventStoreStub([goalEncrypted]);
    const projectStore = new EventStoreStub([projectEncrypted]);

    const publisher = new CommittedEventPublisher(
      store as unknown as Store,
      bus,
      toDomain,
      keyStore,
      CommittedEventPublisher.buildStreams({
        goalEventStore: goalStore,
        projectEventStore: projectStore,
      })
    );

    await publisher.start();

    expect(
      bus
        .getPublished()
        .map((e) => e.eventType)
        .sort()
    ).toEqual(['GoalCreated', 'ProjectCreated'].sort());
  });
});
