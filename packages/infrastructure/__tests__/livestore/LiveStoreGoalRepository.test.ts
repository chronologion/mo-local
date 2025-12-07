import { describe, expect, it } from 'vitest';
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

const adapter: GoalEventAdapter = {
  toEncrypted(event: DomainEvent, version: number, encryptionKey: Uint8Array) {
    return {
      id: `${event.eventType}-${version}`,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: new TextEncoder().encode(
        JSON.stringify({ ...event, encryptionKey: Array.from(encryptionKey) })
      ),
      version,
      occurredAt: Date.now(),
    };
  },
  toDomain(event, encryptionKey: Uint8Array) {
    const json = JSON.parse(new TextDecoder().decode(event.payload));
    // ensure key was provided
    expect(json.encryptionKey).toEqual(Array.from(encryptionKey));
    return {
      ...json,
      occurredAt: new Date(json.occurredAt ?? Date.now()),
    };
  },
};

describe('LiveStoreGoalRepository', () => {
  it('saves and reloads a goal via event replay', async () => {
    const store = new LiveStoreEventStore();
    const key = new Uint8Array([1, 2, 3]);
    const repo = new LiveStoreGoalRepository(store, adapter, async () => key);

    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.of('Test'),
      targetMonth: Month.fromString('2025-12'),
      priority: Priority.Must,
      createdBy: UserId.of('user-1'),
    });

    await repo.save(goal, key);

    const loaded = await repo.findById(goal.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.summary.value).toBe('Test');
  });

  it('wraps persistence errors', async () => {
    const store = new LiveStoreEventStore();
    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.of('Test'),
      targetMonth: Month.fromString('2025-12'),
      priority: Priority.Must,
      createdBy: UserId.of('user-1'),
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
