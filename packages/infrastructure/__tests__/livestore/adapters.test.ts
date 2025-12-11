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
  GoalId,
  Slice,
  Summary,
  Month,
  Priority,
  UserId,
  Timestamp,
  Permission,
  ProjectCreated,
  ProjectNameChanged,
  ProjectArchived,
  ProjectId,
  ProjectName,
  ProjectStatus,
  LocalDate,
  ProjectDescription,
} from '@mo/domain';

const key = new Uint8Array(32).fill(1);

describe('Domain/LiveStore adapters', () => {
  it('round-trips all goal events', async () => {
    const crypto = new NodeCryptoService();
    const toLs = new DomainToLiveStoreAdapter(crypto);
    const toDomain = new LiveStoreToDomainAdapter(crypto);

    const events = [
      new GoalCreated({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        slice: Slice.from('Health'),
        summary: Summary.from('Test'),
        targetMonth: Month.from('2025-12'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(
          new Date('2025-01-01T00:00:00Z').getTime()
        ),
      }),
      new GoalSummaryChanged({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        summary: Summary.from('Updated'),
        changedAt: Timestamp.fromMillis(
          new Date('2025-02-01T00:00:00Z').getTime()
        ),
      }),
      new GoalSliceChanged({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        slice: Slice.from('Work'),
        changedAt: Timestamp.fromMillis(
          new Date('2025-02-02T00:00:00Z').getTime()
        ),
      }),
      new GoalTargetChanged({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        targetMonth: Month.from('2026-01'),
        changedAt: Timestamp.fromMillis(
          new Date('2025-02-03T00:00:00Z').getTime()
        ),
      }),
      new GoalPriorityChanged({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        priority: Priority.from('should'),
        changedAt: Timestamp.fromMillis(
          new Date('2025-02-04T00:00:00Z').getTime()
        ),
      }),
      new GoalArchived({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        archivedAt: Timestamp.fromMillis(
          new Date('2025-03-01T00:00:00Z').getTime()
        ),
      }),
      new GoalAccessGranted({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        grantedTo: UserId.from('user-2'),
        permission: Permission.from('edit'),
        grantedAt: Timestamp.fromMillis(
          new Date('2025-02-05T00:00:00Z').getTime()
        ),
      }),
      new GoalAccessRevoked({
        goalId: GoalId.from('00000000-0000-0000-0000-000000000101'),
        revokedFrom: UserId.from('user-2'),
        revokedAt: Timestamp.fromMillis(
          new Date('2025-02-06T00:00:00Z').getTime()
        ),
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

  it('round-trips project events', async () => {
    const crypto = new NodeCryptoService();
    const toLs = new DomainToLiveStoreAdapter(crypto);
    const toDomain = new LiveStoreToDomainAdapter(crypto);

    const projectEvents = [
      new ProjectCreated({
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000201'),
        name: ProjectName.from('Project Phoenix'),
        status: ProjectStatus.from('planned'),
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-06-01'),
        description: ProjectDescription.from('Rebuild platform'),
        goalId: null,
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(
          new Date('2024-12-01T00:00:00Z').getTime()
        ),
      }),
      new ProjectNameChanged({
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000201'),
        name: ProjectName.from('Project Helios'),
        changedAt: Timestamp.fromMillis(
          new Date('2025-01-15T00:00:00Z').getTime()
        ),
      }),
      new ProjectArchived({
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000201'),
        archivedAt: Timestamp.fromMillis(
          new Date('2025-07-01T00:00:00Z').getTime()
        ),
      }),
    ];

    const encrypted = await toLs.toEncryptedBatch(projectEvents, 1, key);
    const decoded = await toDomain.toDomainBatch(encrypted, key);

    expect(decoded.map((e) => e.eventType)).toEqual([
      'ProjectCreated',
      'ProjectNameChanged',
      'ProjectArchived',
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
