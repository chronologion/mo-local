import { beforeEach, describe, expect, it } from 'vitest';
import {
  LiveStoreGoalRepository,
  GoalEventAdapter,
} from '../fixtures/livestore/LiveStoreGoalRepository';
import { LiveStoreEventStore } from '../fixtures/livestore/LiveStoreEventStore';
import {
  Goal,
  GoalId,
  Slice,
  Summary,
  Month,
  Priority,
  UserId,
  DomainEvent,
} from '@mo/domain';
import { PersistenceError } from '../../src/errors';

const cachedEvents = new Map<string, DomainEvent>();

const adapter: GoalEventAdapter = {
  toEncrypted(event: DomainEvent, version: number, encryptionKey: Uint8Array) {
    const id = `${event.eventType}-${version}`;
    cachedEvents.set(id, event);
    return {
      id,
      aggregateId: event.aggregateId.value,
      eventType: event.eventType,
      payload: new Uint8Array(encryptionKey), // dummy payload to satisfy contract
      version,
      occurredAt: event.occurredAt.value,
    };
  },
  toDomain(event) {
    const cached = cachedEvents.get(event.id);
    if (!cached) {
      throw new Error(`Missing cached event for ${event.id}`);
    }
    return cached;
  },
};

beforeEach(() => {
  cachedEvents.clear();
});

describe('LiveStoreGoalRepository', () => {
  it('saves and reloads a goal via event replay', async () => {
    const store = new LiveStoreEventStore();
    const key = new Uint8Array([1, 2, 3]);
    const repo = new LiveStoreGoalRepository(store, adapter, async () => key);

    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.from('Test'),
      targetMonth: Month.from('2025-12'),
      priority: Priority.Must,
      createdBy: UserId.from('user-1'),
    });

    await repo.save(goal, key);

    const loaded = await repo.load(goal.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.summary.value).toBe('Test');
  });

  it('wraps persistence errors', async () => {
    const store = new LiveStoreEventStore();
    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.from('Test'),
      targetMonth: Month.from('2025-12'),
      priority: Priority.Must,
      createdBy: UserId.from('user-1'),
    });

    const adapterThrowing: GoalEventAdapter = {
      ...adapter,
      toEncrypted() {
        throw new Error('boom');
      },
    };
    const failingRepo = new LiveStoreGoalRepository(
      store,
      adapterThrowing,
      async () => new Uint8Array([9])
    );

    await expect(
      failingRepo.save(goal, new Uint8Array([9]))
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});
