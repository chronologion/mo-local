import { beforeEach, describe, expect, it } from 'vitest';
import { LocalEventStore } from './services/LocalEventStore';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  length = 0;
  clear(): void {
    this.store.clear();
    this.length = 0;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
    this.length = this.store.size;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
    this.length = this.store.size;
  }
}

describe('LocalEventStore', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  it('persists and retrieves events', async () => {
    const store = new LocalEventStore();
    await store.append('a1', [
      {
        id: 'e1',
        aggregateId: 'a1',
        eventType: 'GoalCreated',
        payload: new Uint8Array([1, 2, 3]),
        version: 1,
        occurredAt: Date.now(),
      },
    ]);

    const events = await store.getEvents('a1');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual(new Uint8Array([1, 2, 3]));
    expect(events[0].sequence).toBe(1);
  });
});
