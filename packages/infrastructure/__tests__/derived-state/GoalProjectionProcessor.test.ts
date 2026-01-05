import { describe, expect, it } from 'vitest';
import {
  ActorId,
  EventId,
  GoalCreated,
  GoalId,
  GoalRefined,
  Month,
  Priority,
  Slice,
  Summary,
  Timestamp,
  UserId,
} from '@mo/domain';
import { AggregateTypes } from '@mo/eventstore-core';
import { WebCryptoService } from '../../src/crypto/WebCryptoService';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { EncryptedEventToDomainAdapter } from '../../src/eventstore/adapters/EncryptedEventToDomainAdapter';
import { DomainToEncryptedEventAdapter } from '../../src/eventstore/adapters/DomainToEncryptedEventAdapter';
import { GoalProjectionProcessor } from '../../src/goals/derived-state/GoalProjectionProcessor';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { TestProjectionDb } from './TestProjectionDb';

const baseDate = Timestamp.fromMillis(new Date('2025-01-01T00:00:00Z').getTime());

const meta = (goalId: GoalId) => ({
  aggregateId: goalId,
  occurredAt: baseDate,
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

describe('GoalProjectionProcessor', () => {
  it('applies events, persists search index, and rebuilds on rebase', async () => {
    const db = new TestProjectionDb();
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    keyStore.setMasterKey(await crypto.generateKey());
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const toDomain = new EncryptedEventToDomainAdapter(crypto);
    const toEncrypted = new DomainToEncryptedEventAdapter(crypto);
    const processor = new GoalProjectionProcessor(db, crypto, keyStore, keyringManager, toDomain);

    const goalId = GoalId.from('00000000-0000-0000-0000-000000000001');
    const kGoal = await crypto.generateKey();
    const keyringUpdate = await keyringManager.createInitialUpdate(goalId.value, kGoal, baseDate.value);
    if (!keyringUpdate) {
      throw new Error('Expected keyring update');
    }

    const created = new GoalCreated(
      {
        goalId,
        slice: Slice.from('Health'),
        summary: Summary.from('Run a marathon'),
        targetMonth: Month.from('2025-12'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta(goalId)
    );
    const refined = new GoalRefined(
      { goalId, summary: Summary.from('Run two marathons'), changedAt: baseDate },
      meta(goalId)
    );

    const encryptedCreated = await toEncrypted.toEncrypted(created, 1, kGoal, {
      epoch: keyringUpdate.epoch,
      keyringUpdate: keyringUpdate.keyringUpdate,
    });
    const encryptedRefined = await toEncrypted.toEncrypted(refined, 2, kGoal);

    db.insertEvent(AggregateTypes.goal, encryptedCreated, { commitSequence: 1, globalSequence: 1 });
    db.insertEvent(AggregateTypes.goal, encryptedRefined, { commitSequence: 2, globalSequence: 2 });

    await processor.searchGoals('', undefined);
    await processor.start();
    await processor.whenReady();

    const goal = processor.getGoalById(goalId.value);
    expect(goal?.summary).toBe('Run two marathons');

    const indexRow = db.getIndexArtifactRow('goal_search', 'global');
    expect(indexRow).not.toBeNull();

    await processor.onRebaseRequired();
    const rebuiltGoal = processor.getGoalById(goalId.value);
    expect(rebuiltGoal?.summary).toBe('Run two marathons');
  });
});
