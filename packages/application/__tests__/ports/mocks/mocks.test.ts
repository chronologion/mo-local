import { describe, expect, it } from 'vitest';
import {
  Goal,
  GoalId,
  Month,
  Priority,
  Slice,
  Summary,
  UserId,
} from '@mo/domain';
import { InMemoryGoalRepository } from '../../fixtures/ports/InMemoryGoalRepository';
import { InMemoryEventBus } from '../../fixtures/ports/InMemoryEventBus';
import { MockCryptoService } from '../../fixtures/ports/MockCryptoService';

describe('InMemoryGoalRepository', () => {
  it('saves, loads, and deletes goals', async () => {
    const repo = new InMemoryGoalRepository();
    const goal = Goal.create({
      id: GoalId.create(),
      slice: Slice.Health,
      summary: Summary.from('Test goal'),
      targetMonth: Month.now(),
      priority: Priority.Must,
      createdBy: UserId.from('user-1'),
    });
    const key = Uint8Array.from([1, 2, 3, 4]);

    await repo.save(goal, key);
    expect(await repo.load(goal.id)).toBe(goal);
    expect(repo.getStoredKey(goal.id)).toEqual(key);

    await repo.delete(goal.id);
    expect(await repo.load(goal.id)).toBeNull();
  });
});

describe('InMemoryEventBus', () => {
  it('publishes events to subscribers by event type', async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];

    bus.subscribe('TestEvent', async (event) => {
      received.push((event.aggregateId as { value: string }).value);
    });

    const events = [
      {
        eventType: 'TestEvent',
        occurredAt: { value: Date.now() } as never,
        aggregateId: { value: 'a-1' } as never,
      },
      {
        eventType: 'OtherEvent',
        occurredAt: { value: Date.now() } as never,
        aggregateId: { value: 'a-2' } as never,
      },
      {
        eventType: 'TestEvent',
        occurredAt: { value: Date.now() } as never,
        aggregateId: { value: 'a-3' } as never,
      },
    ];

    await bus.publish(events);
    expect(received).toEqual(['a-1', 'a-3']);
  });
});

describe('MockCryptoService', () => {
  it('encrypts and decrypts symmetrically (test-only)', async () => {
    const crypto = new MockCryptoService();
    const key = await crypto.generateKey();
    const plaintext = Uint8Array.from([10, 20, 30, 40]);

    const ciphertext = await crypto.encrypt(plaintext, key);
    const roundTrip = await crypto.decrypt(ciphertext, key);

    expect(roundTrip).toEqual(plaintext);
  });

  it('derives a deterministic sub-key', async () => {
    const crypto = new MockCryptoService();
    const key = await crypto.generateKey();

    const k1 = await crypto.deriveKey(key, 'context-1');
    const k2 = await crypto.deriveKey(key, 'context-1');
    const k3 = await crypto.deriveKey(key, 'context-2');

    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
  });

  it('wraps and unwraps keys', async () => {
    const crypto = new MockCryptoService();
    const recipient = await crypto.generateEncryptionKeyPair();
    const keyToWrap = Uint8Array.from([5, 6, 7, 8]);

    const wrapped = await crypto.wrapKey(keyToWrap, recipient.publicKey);
    const unwrapped = await crypto.unwrapKey(wrapped, recipient.privateKey);

    expect(unwrapped).toEqual(keyToWrap);
  });
});
