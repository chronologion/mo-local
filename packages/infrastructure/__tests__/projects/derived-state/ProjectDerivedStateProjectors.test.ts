import { describe, expect, it } from 'vitest';
import {
  ActorId,
  EventId,
  GoalId,
  LocalDate,
  ProjectArchived,
  ProjectCreated,
  ProjectDescription,
  ProjectGoalRemoved,
  ProjectId,
  ProjectName,
  ProjectStatus,
  Timestamp,
  UserId,
} from '@mo/domain';
import type { EffectiveCursor } from '@mo/eventstore-core';
import {
  ProjectionCacheStore,
  IndexArtifactStore,
} from '../../../src/platform/derived-state';
import { WebCryptoService } from '../../../src/crypto/WebCryptoService';
import { InMemoryKeyStore } from '../../fixtures/InMemoryKeyStore';
import { TestDerivedStateDb } from '../../derived-state/TestDerivedStateDb';
import { ProjectSnapshotProjector } from '../../../src/projects/derived-state/ProjectSnapshotProjector';
import { ProjectSearchProjector } from '../../../src/projects/derived-state/ProjectSearchProjector';
import type { ProjectListItem } from '../../../src/projects/projections/model/ProjectProjectionState';

const cursor: EffectiveCursor = {
  globalSequence: 10,
  pendingCommitSequence: 0,
};

const baseDate = Timestamp.fromMillis(
  new Date('2025-01-01T00:00:00Z').getTime()
);
const goalId = GoalId.from('00000000-0000-0000-0000-000000000101');
const projectId = ProjectId.from('00000000-0000-0000-0000-000000000201');
const meta = () => ({
  aggregateId: projectId,
  occurredAt: baseDate,
  eventId: EventId.create(),
  actorId: ActorId.from('user-1'),
});

const makeEncryptedEvent = (eventId: string, aggregateId: string) => ({
  id: eventId,
  aggregateId,
  eventType: 'ProjectCreated',
  payload: new Uint8Array([1]),
  version: 1,
  occurredAt: baseDate.value,
  actorId: null,
  causationId: null,
  correlationId: null,
  commitSequence: 1,
  epoch: null,
  keyringUpdate: null,
});

describe('Projects derived-state projectors', () => {
  it('ProjectSnapshotProjector persists and rehydrates snapshots and goal index', async () => {
    const db = new TestDerivedStateDb();
    const cacheStore = new ProjectionCacheStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    const projector = new ProjectSnapshotProjector(
      cacheStore,
      crypto,
      keyStore
    );

    const aggregateId = projectId.value;
    const kProject = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, kProject);

    const createdEvent = new ProjectCreated(
      {
        projectId,
        name: ProjectName.from('Alpha'),
        status: ProjectStatus.from('planned'),
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-06-01'),
        description: ProjectDescription.from('First project'),
        goalId,
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta()
    );

    await projector.applyEvent(
      makeEncryptedEvent('e1', aggregateId),
      createdEvent,
      kProject,
      cursor,
      1
    );

    expect(projector.getProjection(aggregateId)?.goalId).toBe(goalId.value);
    expect(projector.listByGoalId(goalId.value).map((item) => item.id)).toEqual(
      [aggregateId]
    );

    await projector.applyEvent(
      makeEncryptedEvent('e2', aggregateId),
      new ProjectGoalRemoved({ projectId, removedAt: baseDate }, meta()),
      kProject,
      { globalSequence: 11, pendingCommitSequence: 0 },
      2
    );

    expect(projector.getProjection(aggregateId)?.goalId).toBeNull();
    expect(projector.listByGoalId(goalId.value)).toEqual([]);

    projector.clearCaches();
    await projector.bootstrapFromCache();
    expect(projector.getProjection(aggregateId)?.goalId).toBeNull();
    expect(projector.listByGoalId(goalId.value)).toEqual([]);
  });

  it('ProjectSnapshotProjector skips archived projects on bootstrap', async () => {
    const db = new TestDerivedStateDb();
    const cacheStore = new ProjectionCacheStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    const projector = new ProjectSnapshotProjector(
      cacheStore,
      crypto,
      keyStore
    );

    const aggregateId = projectId.value;
    const kProject = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, kProject);

    const createdEvent = new ProjectCreated(
      {
        projectId,
        name: ProjectName.from('Alpha'),
        status: ProjectStatus.from('planned'),
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-06-01'),
        description: ProjectDescription.from('First project'),
        goalId: null,
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta()
    );

    await projector.applyEvent(
      makeEncryptedEvent('e1', aggregateId),
      createdEvent,
      kProject,
      cursor,
      1
    );
    await projector.applyEvent(
      makeEncryptedEvent('e2', aggregateId),
      new ProjectArchived({ projectId, archivedAt: baseDate }, meta()),
      kProject,
      { globalSequence: 11, pendingCommitSequence: 0 },
      2
    );

    projector.clearCaches();
    await projector.bootstrapFromCache();
    expect(projector.getProjection(aggregateId)).toBeNull();
  });

  it('ProjectSearchProjector persists and reloads index; respects filters', async () => {
    const db = new TestDerivedStateDb();
    const indexStore = new IndexArtifactStore(db);
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();

    const items: ProjectListItem[] = [
      {
        id: projectId.value,
        name: 'Alpha',
        status: 'planned',
        startDate: '2025-01-01',
        targetDate: '2025-06-01',
        description: 'First project',
        goalId: goalId.value,
        milestones: [],
        createdAt: baseDate.value,
        updatedAt: baseDate.value,
        archivedAt: null,
        version: 1,
      },
      {
        id: ProjectId.from('00000000-0000-0000-0000-000000000202').value,
        name: 'Beta',
        status: 'planned',
        startDate: '2025-02-01',
        targetDate: '2025-07-01',
        description: 'Second project',
        goalId: null,
        milestones: [],
        createdAt: baseDate.value + 1,
        updatedAt: baseDate.value + 1,
        archivedAt: null,
        version: 1,
      },
    ];

    const projections = new Map<string, ProjectListItem>(
      items.map((item) => [item.id, item])
    );

    const projector = new ProjectSearchProjector(indexStore, crypto, keyStore);
    await projector.ensureBuilt(items);

    expect(projector.searchProjects('Alpha', projections)).toHaveLength(1);
    expect(projector.searchProjects('', projections, { goalId: null })).toEqual(
      [items[1]]
    );

    await projector.persistIndex(cursor);

    const rehydrated = new ProjectSearchProjector(indexStore, crypto, keyStore);
    await rehydrated.ensureBuilt([]);
    expect(rehydrated.searchProjects('Alpha', projections)).toHaveLength(1);
  });
});
