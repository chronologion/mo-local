import { describe, expect, it } from 'vitest';
import type { EncryptedEvent } from '@mo/application';
import { AggregateTypes } from '@mo/eventstore-core';
import { TestProjectionDb } from './TestProjectionDb';

const baseDate = new Date('2025-01-01T00:00:00Z').getTime();

const makeEvent = (id: string, aggregateId: string, version: number): EncryptedEvent => ({
  id,
  aggregateId,
  eventType: 'GoalCreated',
  payload: new Uint8Array([1]),
  version,
  occurredAt: baseDate,
  actorId: null,
  causationId: null,
  correlationId: null,
  epoch: undefined,
  keyringUpdate: undefined,
});

const EFFECTIVE_ORDER_QUERY = `
  SELECT
    e.id,
    e.aggregate_id,
    e.event_type,
    e.payload_encrypted,
    e.epoch,
    e.keyring_update,
    e.version,
    e.occurred_at,
    e.actor_id,
    e.causation_id,
    e.correlation_id,
    e.commit_sequence,
    m.global_seq
  FROM events e
  LEFT JOIN sync_event_map m ON m.event_id = e.id
  WHERE e.aggregate_type = ?
    AND (
      (m.global_seq IS NOT NULL AND m.global_seq > ? AND e.commit_sequence > ?)
      OR (m.global_seq IS NULL AND e.commit_sequence > ?)
    )
  ORDER BY
    CASE WHEN m.global_seq IS NULL THEN 1 ELSE 0 END,
    m.global_seq ASC,
    e.commit_sequence ASC
  LIMIT ?
`;

describe('TestProjectionDb', () => {
  it('orders synced events before pending events by effective total order', async () => {
    const db = new TestProjectionDb();
    const aggregateId = '00000000-0000-0000-0000-000000000001';

    const e1 = makeEvent('e1', aggregateId, 1);
    const e2 = makeEvent('e2', aggregateId, 2);
    const e3 = makeEvent('e3', aggregateId, 3);
    const e4 = makeEvent('e4', aggregateId, 4);

    db.insertEvent(AggregateTypes.goal, e1, { commitSequence: 1, globalSequence: 1 });
    db.insertEvent(AggregateTypes.goal, e2, { commitSequence: 2 });
    db.insertEvent(AggregateTypes.goal, e3, { commitSequence: 3, globalSequence: 2 });
    db.insertEvent(AggregateTypes.goal, e4, { commitSequence: 4 });

    const rows = await db.query<Readonly<{ id: string }>>(EFFECTIVE_ORDER_QUERY, [AggregateTypes.goal, 0, 0, 0, 10]);

    expect(rows.map((row) => row.id)).toEqual(['e1', 'e3', 'e2', 'e4']);
  });

  it('advances by global and pending cursors', async () => {
    const db = new TestProjectionDb();
    const aggregateId = '00000000-0000-0000-0000-000000000002';

    const e1 = makeEvent('e1', aggregateId, 1);
    const e2 = makeEvent('e2', aggregateId, 2);
    const e3 = makeEvent('e3', aggregateId, 3);
    const e4 = makeEvent('e4', aggregateId, 4);

    db.insertEvent(AggregateTypes.goal, e1, { commitSequence: 1, globalSequence: 1 });
    db.insertEvent(AggregateTypes.goal, e2, { commitSequence: 2 });
    db.insertEvent(AggregateTypes.goal, e3, { commitSequence: 3, globalSequence: 2 });
    db.insertEvent(AggregateTypes.goal, e4, { commitSequence: 4 });

    const rows = await db.query<Readonly<{ id: string }>>(EFFECTIVE_ORDER_QUERY, [AggregateTypes.goal, 1, 2, 2, 10]);

    expect(rows.map((row) => row.id)).toEqual(['e3', 'e4']);
  });
});
