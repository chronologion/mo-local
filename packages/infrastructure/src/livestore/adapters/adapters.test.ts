import { describe, expect, it } from 'vitest';
import { DomainToLiveStoreAdapter } from './DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from './LiveStoreToDomainAdapter';
import { MockCryptoService } from '@mo/application';
import { GoalCreated } from '@mo/domain';

const key = new Uint8Array([1, 2, 3, 4]);

describe('Domain/LiveStore adapters', () => {
  it('round-trips a goal event', async () => {
    const crypto = new MockCryptoService();
    const toLs = new DomainToLiveStoreAdapter(crypto);
    const toDomain = new LiveStoreToDomainAdapter(crypto);

    const domainEvent = new GoalCreated({
      goalId: 'g-1',
      slice: 'Health',
      summary: 'Test',
      targetMonth: '2025-12',
      priority: 'must',
      createdBy: 'user-1',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    });

    const encrypted = await toLs.toEncrypted(domainEvent, 1, key);
    const roundTripped = await toDomain.toDomain(encrypted, key);

    expect(roundTripped.eventType).toBe('GoalCreated');
    expect((roundTripped as GoalCreated).payload.summary).toBe('Test');
  });
});
