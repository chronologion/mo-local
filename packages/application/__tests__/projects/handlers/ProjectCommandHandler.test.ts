import { describe, expect, it } from 'vitest';
import {
  InMemoryEventBus,
  InMemoryKeyStore,
  InMemoryProjectRepository,
  MockCryptoService,
} from '../../fixtures/ports';
import { ProjectCommandHandler } from '../../../src/projects/ProjectCommandHandler';
import { ConcurrencyError } from '../../../src/errors/ConcurrencyError';
import { ProjectId } from '@mo/domain';
import {
  validateChangeProjectDatesCommand,
  validateChangeProjectDescriptionCommand,
  validateChangeProjectNameCommand,
  validateChangeProjectStatusCommand,
  validateCreateProjectCommand,
} from '../../../src/projects/commands';

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
  return { repo, eventBus, keyStore, crypto, handler };
};

describe('ProjectCommandHandler', () => {
  it('creates a project and stores aggregate key', async () => {
    const { handler, keyStore, eventBus, repo } = setup();

    const validated = validateCreateProjectCommand(baseCreate);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const result = await handler.handleCreate(validated.value);

    expect(result.projectId).toBe(projectId);
    const storedKey = await keyStore.getAggregateKey(projectId);
    expect(storedKey).toBeInstanceOf(Uint8Array);
    expect(eventBus.getPublished().length).toBeGreaterThan(0);
    expect(repo.getStoredKey(ProjectId.from(projectId))).toBeDefined();
  });

  it('updates status and publishes event', async () => {
    const { handler, eventBus } = setup();
    const created = validateCreateProjectCommand(baseCreate);
    if (!created.ok) throw new Error('invalid create');
    await handler.handleCreate(created.value);
    const before = eventBus.getPublished().length;

    const result = validateChangeProjectStatusCommand({
      type: 'ChangeProjectStatus' as const,
      projectId,
      status: 'in_progress',
      userId,
      timestamp: Date.now(),
    });

    if (!result.ok) throw new Error('invalid status change');
    await handler.handleChangeStatus(result.value);
    expect(eventBus.getPublished().length).toBeGreaterThan(before);
  });

  it('fails when aggregate key missing', async () => {
    const { handler, keyStore } = setup();
    const created = validateCreateProjectCommand(baseCreate);
    if (!created.ok) throw new Error('invalid create');
    await handler.handleCreate(created.value);
    keyStore.removeAggregateKey(projectId);

    const validated = validateChangeProjectNameCommand({
      type: 'ChangeProjectName' as const,
      projectId,
      name: 'New name',
      userId,
      timestamp: Date.now(),
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await expect(
      handler.handleChangeName(validated.value)
    ).rejects.toBeInstanceOf(Error);
  });

  it('does not publish when repository save fails', async () => {
    const { handler, repo, eventBus } = setup();
    const created = validateCreateProjectCommand(baseCreate);
    if (!created.ok) throw new Error('invalid create');
    await handler.handleCreate(created.value);
    const before = eventBus.getPublished().length;
    repo.failNextSave();

    const validated = validateChangeProjectDescriptionCommand({
      type: 'ChangeProjectDescription' as const,
      projectId,
      description: 'New desc',
      userId,
      timestamp: Date.now(),
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await expect(
      handler.handleChangeDescription(validated.value)
    ).rejects.toBeInstanceOf(Error);
    expect(eventBus.getPublished().length).toBe(before);
  });

  it('surfaces concurrency errors from repository', async () => {
    const { handler, repo } = setup();
    const created = validateCreateProjectCommand(baseCreate);
    if (!created.ok) throw new Error('invalid create');
    await handler.handleCreate(created.value);
    repo.failWith(new ConcurrencyError());

    const validated = validateChangeProjectDatesCommand({
      type: 'ChangeProjectDates' as const,
      projectId,
      startDate: '2025-01-02',
      targetDate: '2025-03-01',
      userId,
      timestamp: Date.now(),
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await expect(
      handler.handleChangeDates(validated.value)
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('fails when event bus publish fails', async () => {
    const { handler, eventBus } = setup();
    const created = validateCreateProjectCommand(baseCreate);
    if (!created.ok) throw new Error('invalid create');
    await handler.handleCreate(created.value);
    const before = eventBus.getPublished().length;
    eventBus.failNext(new Error('publish failed'));

    const validated = validateChangeProjectStatusCommand({
      type: 'ChangeProjectStatus' as const,
      projectId,
      status: 'in_progress',
      userId,
      timestamp: Date.now(),
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await expect(
      handler.handleChangeStatus(validated.value)
    ).rejects.toBeInstanceOf(Error);
    expect(eventBus.getPublished().length).toBe(before);
  });
});
