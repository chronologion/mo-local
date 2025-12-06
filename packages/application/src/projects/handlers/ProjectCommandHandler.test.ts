import { describe, expect, it } from 'vitest';
import {
  InMemoryEventBus,
  InMemoryKeyStore,
  InMemoryProjectRepository,
  MockCryptoService,
} from '../../ports/mocks';
import { ProjectCommandHandler } from './ProjectCommandHandler';
import { ProjectApplicationService } from '../services/ProjectApplicationService';
import { ConcurrencyError } from '../../errors/ConcurrencyError';
import { ProjectId } from '@mo/domain';

const projectId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f201';
const userId = 'user-1';
const baseCreate = {
  type: 'CreateProject' as const,
  projectId,
  name: 'Project Alpha',
  status: 'planned' as const,
  startDate: '2025-01-01',
  targetDate: '2025-02-01',
  description: 'desc',
  goalId: null,
  userId,
  timestamp: Date.now(),
};

const setup = () => {
  const repo = new InMemoryProjectRepository();
  const eventBus = new InMemoryEventBus();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const handler = new ProjectCommandHandler(repo, keyStore, crypto, eventBus);
  const app = new ProjectApplicationService(handler);
  return { repo, eventBus, keyStore, crypto, app };
};

describe('ProjectCommandHandler + ProjectApplicationService', () => {
  it('creates a project and stores aggregate key', async () => {
    const { app, keyStore, eventBus, repo } = setup();

    const result = await app.handle(baseCreate);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectId).toBe(projectId);
      const storedKey = await keyStore.getAggregateKey(projectId);
      expect(storedKey).toBeInstanceOf(Uint8Array);
      expect(eventBus.getPublished().length).toBeGreaterThan(0);
      expect(repo.getStoredKey(ProjectId.of(projectId))).toBeDefined();
    }
  });

  it('updates status and publishes event', async () => {
    const { app, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;

    const result = await app.handle({
      type: 'ChangeProjectStatus' as const,
      projectId,
      status: 'in_progress',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(true);
    expect(eventBus.getPublished().length).toBeGreaterThan(before);
  });

  it('fails when aggregate key missing', async () => {
    const { app, keyStore } = setup();
    await app.handle(baseCreate);
    keyStore.removeAggregateKey(projectId);

    const result = await app.handle({
      type: 'ChangeProjectName' as const,
      projectId,
      name: 'New name',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
  });

  it('does not publish when repository save fails', async () => {
    const { app, repo, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;
    repo.failNextSave();

    const result = await app.handle({
      type: 'ChangeProjectDescription' as const,
      projectId,
      description: 'New desc',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(eventBus.getPublished().length).toBe(before);
  });

  it('surfaces concurrency errors from repository', async () => {
    const { app, repo } = setup();
    await app.handle(baseCreate);
    repo.failWith(new ConcurrencyError());

    const result = await app.handle({
      type: 'ChangeProjectDates' as const,
      projectId,
      startDate: '2025-01-02',
      targetDate: '2025-03-01',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
  });

  it('fails when event bus publish fails', async () => {
    const { app, eventBus } = setup();
    await app.handle(baseCreate);
    const before = eventBus.getPublished().length;
    eventBus.failNext(new Error('publish failed'));

    const result = await app.handle({
      type: 'ChangeProjectStatus' as const,
      projectId,
      status: 'in_progress',
      userId,
      timestamp: Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(eventBus.getPublished().length).toBe(before);
  });
});
