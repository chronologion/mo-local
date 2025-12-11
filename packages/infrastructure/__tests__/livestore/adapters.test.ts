import { describe, expect, it } from 'vitest';
import { DomainToLiveStoreAdapter } from '../../src/livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../../src/livestore/adapters/LiveStoreToDomainAdapter';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import {
  GoalCreated,
  GoalSummaryChanged,
  GoalSliceChanged,
  GoalTargetChanged,
  GoalPriorityChanged,
  GoalArchived,
  GoalAccessGranted,
  GoalAccessRevoked,
} from '@mo/domain';

const key = new Uint8Array(32).fill(1);

describe('Domain/LiveStore adapters', () => {
  it('round-trips all goal events', async () => {
    const crypto = new NodeCryptoService();
    const toLs = new DomainToLiveStoreAdapter(crypto);
    const toDomain = new LiveStoreToDomainAdapter(crypto);

    const events = [
      new GoalCreated({
        goalId: 'g-1',
        slice: 'Health',
        summary: 'Test',
        targetMonth: '2025-12',
        priority: 'must',
        createdBy: 'user-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      }),
      new GoalSummaryChanged({
        goalId: 'g-1',
        summary: 'Updated',
        changedAt: new Date('2025-02-01T00:00:00Z'),
      }),
      new GoalSliceChanged({
        goalId: 'g-1',
        slice: 'Work',
        changedAt: new Date('2025-02-02T00:00:00Z'),
      }),
      new GoalTargetChanged({
        goalId: 'g-1',
        targetMonth: '2026-01',
        changedAt: new Date('2025-02-03T00:00:00Z'),
      }),
      new GoalPriorityChanged({
        goalId: 'g-1',
        priority: 'should',
        changedAt: new Date('2025-02-04T00:00:00Z'),
      }),
      new GoalArchived({
        goalId: 'g-1',
        deletedAt: new Date('2025-03-01T00:00:00Z'),
      }),
      new GoalAccessGranted({
        goalId: 'g-1',
        grantedTo: 'user-2',
        permission: 'edit',
        grantedAt: new Date('2025-02-05T00:00:00Z'),
      }),
      new GoalAccessRevoked({
        goalId: 'g-1',
        revokedFrom: 'user-2',
        revokedAt: new Date('2025-02-06T00:00:00Z'),
      }),
    ];

    const encryptedBatch = await toLs.toEncryptedBatch(events, 1, key);
    const roundTripped = await toDomain.toDomainBatch(encryptedBatch, key);

    expect(roundTripped.map((e) => e.eventType)).toEqual([
      'GoalCreated',
      'GoalSummaryChanged',
      'GoalSliceChanged',
      'GoalTargetChanged',
      'GoalPriorityChanged',
      'GoalArchived',
      'GoalAccessGranted',
      'GoalAccessRevoked',
    ]);
  });

  it('throws on unsupported event type', async () => {
    const crypto = new NodeCryptoService();
    const toDomain = new LiveStoreToDomainAdapter(crypto);
    const payload = new TextEncoder().encode('{}');
    const aad = new TextEncoder().encode('g-1:UnknownEvent:1');
    const encrypted = await crypto.encrypt(payload, key, aad);
    await expect(
      toDomain.toDomain(
        {
          id: 'e1',
          aggregateId: 'g-1',
          eventType: 'UnknownEvent',
          payload: encrypted,
          version: 1,
          occurredAt: Date.now(),
          sequence: 0,
        },
        key
      )
    ).rejects.toThrow(/Unsupported event type/);
  });

  it('throws on malformed payload', async () => {
    const crypto = new NodeCryptoService();
    const toDomain = new LiveStoreToDomainAdapter(crypto);
    await expect(
      toDomain.toDomain(
        {
          id: 'e1',
          aggregateId: 'g-1',
          eventType: 'GoalCreated',
          payload: new Uint8Array([255]), // invalid JSON after decrypt (mock decrypts via XOR)
          version: 1,
          occurredAt: Date.now(),
          sequence: 0,
        },
        key
      )
    ).rejects.toThrow();
  });
});
