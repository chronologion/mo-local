import { describe, expect, it } from 'vitest';
import { ActorId, DomainEvent, EventId, GoalId, Timestamp } from '@mo/domain';
import type { EncryptedEvent, EventBusPort } from '@mo/application';
import { AggregateTypes } from '@mo/eventstore-core';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { MissingKeyError } from '../../src/errors';
import { EncryptedEventToDomainAdapter } from '../../src/eventstore/adapters/EncryptedEventToDomainAdapter';
import { CommittedEventPublisher } from '../../src/eventing/CommittedEventPublisher';
import { SqliteEventStore } from '../../src/eventstore/SqliteEventStore';
import { ProjectionMetaStore } from '../../src/platform/derived-state/stores/ProjectionMetaStore';
import { TestSqliteDb } from '../eventstore/TestSqliteDb';

class TestDomainEvent extends DomainEvent<GoalId> {
  readonly eventType: string;

  constructor(params: {
    eventType: string;
    aggregateId: GoalId;
    occurredAt: Timestamp;
    eventId: EventId;
    actorId: ActorId;
  }) {
    super(params);
    this.eventType = params.eventType;
  }
}

class CapturingEventBus implements EventBusPort {
  readonly published: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }

  subscribe(_eventType: string, _handler: (event: DomainEvent) => void): void {
    return;
  }
}

class TestKeyringManager extends KeyringManager {
  constructor() {
    const crypto = new NodeCryptoService();
    const keyStore = new InMemoryKeyStore();
    const keyringStore = new InMemoryKeyringStore();
    super(crypto, keyStore, keyringStore);
  }

  async resolveKeyForEvent(): Promise<Uint8Array> {
    return new Uint8Array([1, 2, 3]);
  }
}

class MissingKeyringManager extends KeyringManager {
  private readonly missingEventIds = new Set<string>();

  constructor(missingEventIds: ReadonlyArray<string>) {
    const crypto = new NodeCryptoService();
    const keyStore = new InMemoryKeyStore();
    const keyringStore = new InMemoryKeyringStore();
    super(crypto, keyStore, keyringStore);
    missingEventIds.forEach((id) => this.missingEventIds.add(id));
  }

  async resolveKeyForEvent(event: EncryptedEvent): Promise<Uint8Array> {
    if (this.missingEventIds.has(event.id)) {
      throw new MissingKeyError(`Missing key for ${event.id}`);
    }
    return new Uint8Array([9, 9, 9]);
  }
}

class TestEncryptedEventToDomainAdapter extends EncryptedEventToDomainAdapter {
  constructor() {
    super(new NodeCryptoService());
  }

  async toDomain(encryptedEvent: EncryptedEvent, _aggregateKey: Uint8Array): Promise<DomainEvent> {
    return new TestDomainEvent({
      eventType: encryptedEvent.eventType,
      aggregateId: GoalId.from(encryptedEvent.aggregateId),
      occurredAt: Timestamp.fromMillis(encryptedEvent.occurredAt),
      eventId: EventId.from(encryptedEvent.id),
      actorId: ActorId.from(encryptedEvent.actorId ?? 'system'),
    });
  }
}

const buildEncryptedEvent = (params: {
  id: string;
  aggregateId: string;
  eventType: string;
  version: number;
  occurredAt: number;
  actorId: string;
}): EncryptedEvent => ({
  id: params.id,
  aggregateId: params.aggregateId,
  eventType: params.eventType,
  payload: new Uint8Array([1, 2, 3]),
  version: params.version,
  occurredAt: params.occurredAt,
  actorId: params.actorId,
  causationId: null,
  correlationId: null,
  epoch: undefined,
  keyringUpdate: undefined,
});

describe('CommittedEventPublisher', () => {
  it('publishes committed events in commit-sequence order and persists cursor', async () => {
    const db = new TestSqliteDb();
    const eventStore = new SqliteEventStore(db, AggregateTypes.goal);
    const eventBus = new CapturingEventBus();
    const adapter = new TestEncryptedEventToDomainAdapter();
    const keyringManager = new TestKeyringManager();

    const aggregateId = GoalId.create().value;
    const actorId = ActorId.system().value;

    await eventStore.append(aggregateId, [
      buildEncryptedEvent({
        id: 'event-1',
        aggregateId,
        eventType: 'goal.created',
        version: 1,
        occurredAt: 1,
        actorId,
      }),
      buildEncryptedEvent({
        id: 'event-2',
        aggregateId,
        eventType: 'goal.renamed',
        version: 2,
        occurredAt: 2,
        actorId,
      }),
    ]);

    const publisher = new CommittedEventPublisher(db, eventBus, adapter, keyringManager, [
      { name: 'goals', eventStore },
    ]);

    await publisher.start();

    expect(eventBus.published.map((event) => event.eventType)).toEqual(['goal.created', 'goal.renamed']);

    const metaStore = new ProjectionMetaStore(db);
    const meta = await metaStore.get('committed_publisher:goals');
    expect(meta?.lastCommitSequence).toBe(2);

    const secondBus = new CapturingEventBus();
    const secondPublisher = new CommittedEventPublisher(db, secondBus, adapter, keyringManager, [
      { name: 'goals', eventStore },
    ]);
    await secondPublisher.start();
    expect(secondBus.published).toHaveLength(0);
  });

  it('skips missing-key events but advances cursor', async () => {
    const db = new TestSqliteDb();
    const eventStore = new SqliteEventStore(db, AggregateTypes.goal);
    const eventBus = new CapturingEventBus();
    const adapter = new TestEncryptedEventToDomainAdapter();
    const aggregateId = GoalId.create().value;
    const actorId = ActorId.system().value;

    await eventStore.append(aggregateId, [
      buildEncryptedEvent({
        id: 'event-1',
        aggregateId,
        eventType: 'goal.created',
        version: 1,
        occurredAt: 1,
        actorId,
      }),
      buildEncryptedEvent({
        id: 'event-2',
        aggregateId,
        eventType: 'goal.renamed',
        version: 2,
        occurredAt: 2,
        actorId,
      }),
    ]);

    const keyringManager = new MissingKeyringManager(['event-1']);
    const publisher = new CommittedEventPublisher(db, eventBus, adapter, keyringManager, [
      { name: 'goals', eventStore },
    ]);

    await publisher.start();

    expect(eventBus.published.map((event) => event.eventType)).toEqual(['goal.renamed']);

    const metaStore = new ProjectionMetaStore(db);
    const meta = await metaStore.get('committed_publisher:goals');
    expect(meta?.lastCommitSequence).toBe(2);
  });
});
