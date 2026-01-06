import { describe, expect, it } from 'vitest';
import {
  ActorId,
  EventId,
  LocalDate,
  ProjectCreated,
  ProjectDescription,
  ProjectId,
  ProjectName,
  ProjectStatus,
  Timestamp,
  UserId,
} from '@mo/domain';
import { AggregateTypes } from '@mo/eventstore-core';
import { WebCryptoService } from '../../src/crypto/WebCryptoService';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { EncryptedEventToDomainAdapter } from '../../src/eventstore/adapters/EncryptedEventToDomainAdapter';
import { DomainToEncryptedEventAdapter } from '../../src/eventstore/adapters/DomainToEncryptedEventAdapter';
import { ProjectProjectionProcessor } from '../../src/projects/derived-state/ProjectProjectionProcessor';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { TestProjectionDb } from './TestProjectionDb';

const baseDate = Timestamp.fromMillis(new Date('2025-01-01T00:00:00Z').getTime());

const meta = (projectId: ProjectId, eventId: EventId) => ({
  aggregateId: projectId,
  occurredAt: baseDate,
  eventId,
  actorId: ActorId.from('user-1'),
});

describe('ProjectProjectionProcessor', () => {
  it('applies events, persists search index, and rebuilds on rebase', async () => {
    const db = new TestProjectionDb();
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    keyStore.setMasterKey(await crypto.generateKey());
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const toDomain = new EncryptedEventToDomainAdapter(crypto);
    const toEncrypted = new DomainToEncryptedEventAdapter(crypto, 'project');
    const processor = new ProjectProjectionProcessor(db, crypto, keyStore, keyringManager, toDomain);

    const projectId = ProjectId.from('00000000-0000-0000-0000-000000000201');
    const kProject = await crypto.generateKey();
    const keyringUpdate = await keyringManager.createInitialUpdate(projectId.value, kProject, baseDate.value);
    if (!keyringUpdate) {
      throw new Error('Expected keyring update');
    }

    const created = new ProjectCreated(
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
      meta(projectId, EventId.from('00000000-0000-0000-0000-0000000000b1'))
    );

    const encryptedCreated = await toEncrypted.toEncrypted(created, 1, kProject, {
      epoch: keyringUpdate.epoch,
      keyringUpdate: keyringUpdate.keyringUpdate,
    });

    db.insertEvent(AggregateTypes.project, encryptedCreated, { commitSequence: 1, globalSequence: 1 });

    await processor.searchProjects('');
    await processor.start();
    await processor.whenReady();

    const project = processor.getProjectById(projectId.value);
    expect(project?.name).toBe('Alpha');

    const indexRow = db.getIndexArtifactRow('project_search', 'global');
    expect(indexRow).not.toBeNull();

    await processor.onRebaseRequired();
    const rebuiltProject = processor.getProjectById(projectId.value);
    expect(rebuiltProject?.name).toBe('Alpha');
  });

  it('handles empty event stream without changes', async () => {
    const db = new TestProjectionDb();
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    keyStore.setMasterKey(await crypto.generateKey());
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const toDomain = new EncryptedEventToDomainAdapter(crypto);
    const processor = new ProjectProjectionProcessor(db, crypto, keyStore, keyringManager, toDomain);

    await processor.start();
    await processor.whenReady();

    expect(processor.listProjects()).toEqual([]);
    expect(processor.getProjectById('missing')).toBeNull();
  });

  it('skips events when aggregate key is missing', async () => {
    const db = new TestProjectionDb();
    const crypto = new WebCryptoService();
    const keyStore = new InMemoryKeyStore();
    keyStore.setMasterKey(await crypto.generateKey());
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const toDomain = new EncryptedEventToDomainAdapter(crypto);
    const toEncrypted = new DomainToEncryptedEventAdapter(crypto, 'project');
    const processor = new ProjectProjectionProcessor(db, crypto, keyStore, keyringManager, toDomain);

    const projectId = ProjectId.from('00000000-0000-0000-0000-000000000202');
    const kProject = await crypto.generateKey();
    const created = new ProjectCreated(
      {
        projectId,
        name: ProjectName.from('Missing'),
        status: ProjectStatus.from('planned'),
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-06-01'),
        description: ProjectDescription.from('Missing key'),
        goalId: null,
        createdBy: UserId.from('user-1'),
        createdAt: baseDate,
      },
      meta(projectId, EventId.from('00000000-0000-0000-0000-0000000000b2'))
    );

    const encryptedCreated = await toEncrypted.toEncrypted(created, 1, kProject);
    db.insertEvent(AggregateTypes.project, encryptedCreated, { commitSequence: 1, globalSequence: 1 });

    await processor.start();
    await processor.whenReady();

    expect(processor.getProjectById(projectId.value)).toBeNull();
  });
});
