import { describe, expect, it, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ConcurrencyError } from '@mo/application';
import { MemoryVFS } from '@livestore/wa-sqlite/src/examples/MemoryVFS.js';
import { WaSqliteEventStore } from './WaSqliteEventStore';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm');

const baseEvent = (aggregateId: string, version: number) => ({
  id: `${aggregateId}-${version}`,
  aggregateId,
  eventType: 'TestEvent',
  payload: new Uint8Array([version]),
  version,
  occurredAt: Date.now(),
});

let wasmBinary: Uint8Array;

beforeAll(async () => {
  wasmBinary = await readFile(wasmPath);
});

const createStore = () =>
  WaSqliteEventStore.initialize({
    filename: '/memory.db',
    moduleOptions: { wasmBinary },
    vfsFactory: async (sqlite, module) => {
      const vfs = new (MemoryVFS as unknown as {
        new (name: string, module: unknown): { name: string };
      })('memory', module) as { name: string };
      sqlite.vfs_register(vfs as never, true);
      return { name: vfs.name };
    },
  });

describe('WaSqliteEventStore', () => {
  it('appends and retrieves events with sequences', async () => {
    const store = await createStore();
    const tables = await store.debugListTables();
    expect(tables).toContain('goal_events');

    await store.append('a1', [baseEvent('a1', 1), baseEvent('a1', 2)]);

    const events = await store.getEvents('a1');
    expect(events.map((e) => e.version)).toEqual([1, 2]);
    expect(events[0].sequence).toBeGreaterThan(0);

    await store.close();
  });

  it('enforces monotonic versions', async () => {
    const store = await createStore();
    const tables = await store.debugListTables();
    expect(tables).toContain('goal_events');
    await store.append('a1', [baseEvent('a1', 1)]);
    await expect(
      store.append('a1', [baseEvent('a1', 3)])
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await store.close();
  });

  it('filters across aggregates and sequences', async () => {
    const store = await createStore();
    await store.append('a1', [baseEvent('a1', 1)]);
    await store.append('a2', [baseEvent('a2', 1)]);
    await store.append('a1', [baseEvent('a1', 2)]);

    const all = await store.getAllEvents();
    const sequences = all.map((e) => e.sequence);
    expect(sequences).toEqual([1, 2, 3]);

    const sinceSecond = await store.getAllEvents({ since: 1 });
    expect(sinceSecond.length).toBe(2);
    expect(sinceSecond[0].aggregateId).toBe('a2');

    await store.close();
  });
});
