import { describe, expect, it } from 'vitest';
import { LiveStoreEventStore } from './LiveStoreEventStore';
import { ConcurrencyError } from '@mo/application';

const baseEvent = (aggregateId: string, version: number) => ({
  id: `evt-${aggregateId}-${version}`,
  aggregateId,
  eventType: 'TestEvent',
  payload: new Uint8Array([version]),
  version,
  occurredAt: Date.now(),
});

describe('LiveStoreEventStore', () => {
  it('appends and retrieves events per aggregate', async () => {
    const store = new LiveStoreEventStore();
    await store.append('a1', [baseEvent('a1', 1), baseEvent('a1', 2)]);

    const events = await store.getEvents('a1');
    expect(events.map((e) => e.version)).toEqual([1, 2]);
    expect(events[0].sequence).toBeDefined();
  });

  it('enforces version monotonicity', async () => {
    const store = new LiveStoreEventStore();
    await store.append('a1', [baseEvent('a1', 1)]);
    await expect(
      store.append('a1', [baseEvent('a1', 3)])
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('filters by since and event type', async () => {
    const store = new LiveStoreEventStore();
    await store.append('a1', [baseEvent('a1', 1), { ...baseEvent('a1', 2), eventType: 'Other' }]);
    await store.append('a2', [baseEvent('a2', 1)]);

    const filtered = await store.getAllEvents({ eventType: 'Other' });
    expect(filtered).toHaveLength(1);

    const since = await store.getAllEvents({ since: filtered[0].sequence });
    expect(since.find((e) => e.aggregateId === 'a1')).toBeUndefined();
  });

  it('assigns global sequence across aggregates', async () => {
    const store = new LiveStoreEventStore();
    await store.append('a1', [baseEvent('a1', 1)]);
    await store.append('a2', [baseEvent('a2', 1)]);
    await store.append('a1', [baseEvent('a1', 2)]);

    const all = await store.getAllEvents();
    const sequences = all.map((e) => e.sequence);
    expect(sequences).toEqual([1, 2, 3]);
  });
});
