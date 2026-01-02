import { describe, expect, it } from 'vitest';
import {
  ActorId,
  EventId,
  GoalArchived,
  GoalCreated,
  GoalId,
  Month,
  Priority,
  Slice,
  Summary,
  Timestamp,
  UserId,
} from '@mo/domain';
import type { EncryptedEvent } from '@mo/application';
import type { EffectiveCursor } from '@mo/eventstore-core';
import { ProjectionCacheStore, IndexArtifactStore } from '../../../src/platform/derived-state';
import { buildProjectionCacheAad } from '../../../src/platform/derived-state/aad';
import { WebCryptoService } from '../../../src/crypto/WebCryptoService';
import { InMemoryKeyStore } from '../../fixtures/InMemoryKeyStore';
import { TestDerivedStateDb } from '../../derived-state/TestDerivedStateDb';
import { GoalSnapshotProjector } from '../../../src/goals/derived-state/GoalSnapshotProjector';
import { GoalAnalyticsProjector } from '../../../src/goals/derived-state/GoalAnalyticsProjector';
import { GoalSearchProjector } from '../../../src/goals/derived-state/GoalSearchProjector';
import {
  applyEventToSnapshot,
  snapshotToListItem,
  type GoalListItem,
  type GoalSnapshotState,
} from '../../../src/goals/projections/model/GoalProjectionState';

const cursor: EffectiveCursor = {
  globalSequence: 10,
  pendingCommitSequence: 0,
};

const baseDate = Timestamp.fromMillis(new Date('2025-01-01T00:00:00Z').getTime());
const goalId = GoalId.from('00000000-0000-0000-0000-000000000001');
const meta = () => ({
  aggregateId: goalId,
  occurredAt: baseDate,
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

const makeEncryptedEvent = (eventId: string, aggregateId: string): EncryptedEvent => ({
  id: eventId,
  aggregateId,
  eventType: 'GoalCreated',
  payload: new Uint8Array([1]),
  version: 1,
  occurredAt: baseDate.value,
  actorId: null,
  causationId: null,
  correlationId: null,
});

describe('Goals derived-state projectors', () => {
  it('GoalSnapshotProjector persists and rehydrates snapshots, skipping archived', async () => {
    const db = new TestDerivedStateDb();
    const cacheStore = new ProjectionCacheStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    const projector = new GoalSnapshotProjector(cacheStore, crypto, keyStore);

    const aggregateId = goalId.value;
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, kGoal);

    const createdEvent = new GoalCreated(
      {
        goalId,
        slice: Slice.from('Health'),
        summary: Summary.from('Run a marathon'),
        targetMonth: Month.from('2025-12'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta()
    );

    await projector.applyEvent(makeEncryptedEvent('e1', aggregateId), createdEvent, kGoal, cursor, 1);

    expect(projector.getProjection(aggregateId)?.summary).toBe('Run a marathon');
    expect(await cacheStore.get('goal_snapshot', aggregateId)).not.toBeNull();

    projector.clearCaches();
    expect(projector.getProjection(aggregateId)).toBeNull();

    await projector.bootstrapFromCache();
    expect(projector.getProjection(aggregateId)?.summary).toBe('Run a marathon');

    await projector.applyEvent(
      makeEncryptedEvent('e2', aggregateId),
      new GoalArchived({ goalId, archivedAt: baseDate }, meta()),
      kGoal,
      { globalSequence: 11, pendingCommitSequence: 0 },
      2
    );
    expect(projector.getProjection(aggregateId)).toBeNull();

    projector.clearCaches();
    await projector.bootstrapFromCache();
    expect(projector.getProjection(aggregateId)).toBeNull();
  });

  it('GoalSnapshotProjector drops corrupted cache rows on bootstrap', async () => {
    const db = new TestDerivedStateDb();
    const cacheStore = new ProjectionCacheStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    const projector = new GoalSnapshotProjector(cacheStore, crypto, keyStore);

    const aggregateId = goalId.value;
    const kGoal = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, kGoal);

    const createdEvent = new GoalCreated(
      {
        goalId,
        slice: Slice.from('Health'),
        summary: Summary.from('Run a marathon'),
        targetMonth: Month.from('2025-12'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta()
    );

    await projector.applyEvent(makeEncryptedEvent('e1', aggregateId), createdEvent, kGoal, cursor, 1);

    const row = db.getProjectionCacheRow('goal_snapshot', aggregateId);
    expect(row).not.toBeNull();
    if (!row) return;

    const corrupted = row.cache_encrypted.slice();
    corrupted[corrupted.length - 1] ^= 0xff;
    db.setProjectionCacheRow({ ...row, cache_encrypted: corrupted });

    projector.clearCaches();
    await projector.bootstrapFromCache();

    expect(projector.getProjection(aggregateId)).toBeNull();
    expect(db.getProjectionCacheRow('goal_snapshot', aggregateId)).toBeNull();
  });

  it('GoalAnalyticsProjector persists deltas and can rebuild by loading prior analytics', async () => {
    const db = new TestDerivedStateDb();
    const cacheStore = new ProjectionCacheStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    const projector = new GoalAnalyticsProjector(cacheStore, crypto, keyStore);

    const created = applyEventToSnapshot(
      null,
      new GoalCreated(
        {
          goalId,
          slice: Slice.from('Health'),
          summary: Summary.from('Run a marathon'),
          targetMonth: Month.from('2025-12'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: baseDate,
        },
        meta()
      ),
      1
    ) as GoalSnapshotState;

    await projector.updateAnalytics(null, created, cursor, 1);

    const analyticsKey = await keyStore.getAggregateKey('goal_analytics');
    expect(analyticsKey).not.toBeNull();
    if (!analyticsKey) return;

    const row = await cacheStore.get('goal_analytics', 'global');
    expect(row).not.toBeNull();
    if (!row) return;

    const aad = buildProjectionCacheAad('goal_analytics', 'global', row.cacheVersion, row.lastEffectiveCursor);
    const plaintext = await crypto.decrypt(row.cacheEncrypted, analyticsKey, aad);
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as {
      monthlyTotals: Record<string, Record<string, number>>;
      categoryRollups: Record<string, Record<string, number>>;
    };
    expect(payload.monthlyTotals['2025-12']?.Health).toBe(1);
    expect(payload.categoryRollups['2025']?.Health).toBe(1);

    const moved: GoalSnapshotState = {
      ...created,
      slice: 'Work',
      targetMonth: '2026-02',
      version: 2,
    };
    await projector.updateAnalytics(created, moved, { globalSequence: 11, pendingCommitSequence: 0 }, 2);

    const row2 = await cacheStore.get('goal_analytics', 'global');
    expect(row2).not.toBeNull();
    if (!row2) return;

    const aad2 = buildProjectionCacheAad('goal_analytics', 'global', row2.cacheVersion, row2.lastEffectiveCursor);
    const plaintext2 = await crypto.decrypt(row2.cacheEncrypted, analyticsKey, aad2);
    const payload2 = JSON.parse(new TextDecoder().decode(plaintext2)) as {
      monthlyTotals: Record<string, Record<string, number>>;
      categoryRollups: Record<string, Record<string, number>>;
    };
    expect(payload2.monthlyTotals['2025-12']).toBeUndefined();
    expect(payload2.categoryRollups['2025']).toBeUndefined();
    expect(payload2.monthlyTotals['2026-02']?.Work).toBe(1);
    expect(payload2.categoryRollups['2026']?.Work).toBe(1);
  });

  it('GoalSearchProjector persists and reloads index; respects filters', async () => {
    const db = new TestDerivedStateDb();
    const indexStore = new IndexArtifactStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();

    const snapshotA: GoalSnapshotState = {
      id: goalId.value,
      slice: 'Health',
      summary: 'Run a marathon',
      targetMonth: '2025-12',
      priority: 'must',
      createdBy: 'user-1',
      createdAt: baseDate.value,
      achievedAt: null,
      archivedAt: null,
      version: 1,
    };
    const snapshotB: GoalSnapshotState = {
      ...snapshotA,
      id: GoalId.from('00000000-0000-0000-0000-000000000002').value,
      summary: 'Ship a product',
      slice: 'Work',
      targetMonth: '2026-01',
      priority: 'should',
    };

    const itemA = snapshotToListItem(snapshotA);
    const itemB = snapshotToListItem(snapshotB);

    const projections = new Map<string, GoalListItem>([
      [itemA.id, itemA],
      [itemB.id, itemB],
    ]);

    const projector = new GoalSearchProjector(indexStore, crypto, keyStore);
    await projector.ensureBuilt(projections.values());

    expect(projector.searchGoals('marathon', projections)).toHaveLength(1);
    expect(projector.searchGoals('', projections, { slice: 'Work' })).toEqual([itemB]);

    await projector.persistIndex(cursor);

    const rehydrated = new GoalSearchProjector(indexStore, crypto, keyStore);
    await rehydrated.ensureBuilt([]);
    expect(rehydrated.searchGoals('marathon', projections)).toHaveLength(1);
  });
});
