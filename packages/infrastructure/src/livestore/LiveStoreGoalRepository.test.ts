import { describe, expect, it } from 'vitest';
import { LiveStoreGoalRepository, EventAdapter } from './LiveStoreGoalRepository';
import { LiveStoreEventStore } from './LiveStoreEventStore';
import { Goal, GoalId, Slice, Summary, Month, Priority, UserId } from '@mo/domain';

const adapter: EventAdapter = {
  toEncrypted(event: any, version: number) {
    return {
      id: `${event.eventType}-${version}`,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: new TextEncoder().encode(JSON.stringify(event)),
      version,
      occurredAt: Date.now(),
    };
  },
  toDomain(event) {
    const json = JSON.parse(new TextDecoder().decode(event.payload));
    return {
      ...json,
      occurredAt: new Date(json.occurredAt ?? Date.now()),
    };
  },
};

describe('LiveStoreGoalRepository', () => {
  it('saves and reloads a goal via event replay', async () => {
    const store = new LiveStoreEventStore();
    const repo = new LiveStoreGoalRepository(store, adapter);

    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.of('Test'),
      targetMonth: Month.fromString('2025-12'),
      priority: Priority.Must,
      createdBy: UserId.of('user-1'),
    });

    await repo.save(goal, new Uint8Array([1]));

    const loaded = await repo.findById(goal.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.summary.value).toBe('Test');
  });
});
