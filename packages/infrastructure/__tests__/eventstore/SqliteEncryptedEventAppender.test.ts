import { describe, expect, it } from 'vitest';
import { ConcurrencyError } from '@mo/application';
import { AggregateTypes } from '@mo/eventstore-core';
import { SqliteEncryptedEventAppender } from '../../src/eventstore/persistence/EncryptedEventAppender';
import type {
  EncryptedEventToAppend,
  EventTableSpec,
} from '../../src/eventstore/persistence/types';
import { TestSqliteDb } from './TestSqliteDb';

const spec: EventTableSpec = {
  table: 'events',
  aggregateType: AggregateTypes.goal,
};

const buildEvent = (
  overrides?: Partial<EncryptedEventToAppend>
): EncryptedEventToAppend => ({
  eventId: overrides?.eventId ?? 'event-1',
  aggregateId: overrides?.aggregateId ?? 'goal-1',
  eventType: overrides?.eventType ?? 'GoalCreated',
  payload: overrides?.payload ?? new Uint8Array([1, 2, 3]),
  version: overrides?.version ?? 1,
  occurredAt: overrides?.occurredAt ?? 10,
  actorId: overrides?.actorId ?? 'user-1',
  causationId: overrides?.causationId ?? null,
  correlationId: overrides?.correlationId ?? null,
  epoch: overrides?.epoch ?? null,
  keyringUpdate: overrides?.keyringUpdate ?? null,
});

describe('SqliteEncryptedEventAppender', () => {
  it('throws ConcurrencyError when known version mismatches', async () => {
    const db = new TestSqliteDb({
      events: [
        {
          commit_sequence: 1,
          id: 'event-0',
          aggregate_type: AggregateTypes.goal,
          aggregate_id: 'goal-1',
          event_type: 'GoalCreated',
          payload_encrypted: new Uint8Array([9]),
          keyring_update: null,
          version: 2,
          occurred_at: 5,
          actor_id: 'user-1',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
      ],
    });
    const appender = new SqliteEncryptedEventAppender();

    await expect(
      appender.appendForAggregate(
        db,
        spec,
        { aggregateId: 'goal-1', version: 1 },
        [buildEvent({ version: 3, eventId: 'event-3' })]
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('throws ConcurrencyError when versions are not contiguous', async () => {
    const db = new TestSqliteDb();
    const appender = new SqliteEncryptedEventAppender();

    await expect(
      appender.appendForAggregate(
        db,
        spec,
        { aggregateId: 'goal-1', version: null },
        [buildEvent({ version: 2, eventId: 'event-2' })]
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('returns commit sequences for appended events', async () => {
    const db = new TestSqliteDb();
    const appender = new SqliteEncryptedEventAppender();

    const appended = await appender.appendForAggregate(
      db,
      spec,
      { aggregateId: 'goal-1', version: null },
      [
        buildEvent({ eventId: 'event-1', version: 1 }),
        buildEvent({ eventId: 'event-2', version: 2 }),
      ]
    );

    expect(appended).toHaveLength(2);
    expect(appended[0]?.commitSequence).toBe(1);
    expect(appended[1]?.commitSequence).toBe(2);
  });

  it('throws ConcurrencyError on duplicate version inserts', async () => {
    const db = new TestSqliteDb({
      events: [
        {
          commit_sequence: 1,
          id: 'event-1',
          aggregate_type: AggregateTypes.goal,
          aggregate_id: 'goal-1',
          event_type: 'GoalCreated',
          payload_encrypted: new Uint8Array([1]),
          keyring_update: null,
          version: 1,
          occurred_at: 5,
          actor_id: 'user-1',
          causation_id: null,
          correlation_id: null,
          epoch: null,
        },
      ],
    });
    const appender = new SqliteEncryptedEventAppender();

    await expect(
      appender.appendForAggregate(
        db,
        spec,
        { aggregateId: 'goal-1', version: null },
        [buildEvent({ eventId: 'event-2', version: 1 })]
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
