import { describe, expect, it } from 'vitest';
import {
  InMemoryKeyStore,
  InMemoryProjectRepository,
  MockCryptoService,
} from '../../fixtures/ports';
import { ProjectCommandHandler } from '../../../src/projects/ProjectCommandHandler';
import { ConcurrencyError } from '../../../src/errors/ConcurrencyError';
import { ProjectId } from '@mo/domain';
import {
  CreateProject,
  ChangeProjectStatus,
  ChangeProjectName,
  ChangeProjectDescription,
  ChangeProjectDates,
} from '../../../src/projects/commands';
import { ValidationException } from '../../../src/errors/ValidationError';

const projectId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f201';
const userId = 'user-1';
const baseCreate = () =>
  new CreateProject({
    projectId,
    name: 'Project Alpha',
    status: 'planned',
    startDate: '2025-01-01',
    targetDate: '2025-02-01',
    description: 'desc',
    goalId: null,
    userId,
    timestamp: Date.now(),
  });

const setup = () => {
  const repo = new InMemoryProjectRepository();
  const keyStore = new InMemoryKeyStore();
  const crypto = new MockCryptoService();
  const handler = new ProjectCommandHandler(repo, keyStore, crypto);
  return { repo, keyStore, crypto, handler };
};

describe('ProjectCommandHandler', () => {
  it('creates a project and stores aggregate key', async () => {
    const { handler, keyStore, repo } = setup();
    const result = await handler.handleCreate(baseCreate());

    expect(result.projectId).toBe(projectId);
    const storedKey = await keyStore.getAggregateKey(projectId);
    expect(storedKey).toBeInstanceOf(Uint8Array);
    expect(repo.getStoredKey(ProjectId.from(projectId))).toBeDefined();
  });

  it('updates status', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    await handler.handleChangeStatus(
      new ChangeProjectStatus({
        projectId,
        status: 'in_progress',
        userId,
        timestamp: Date.now(),
        knownVersion: 1,
      })
    );
  });

  it('fails when aggregate key missing', async () => {
    const { handler, keyStore } = setup();
    await handler.handleCreate(baseCreate());
    keyStore.removeAggregateKey(projectId);

    await expect(
      handler.handleChangeName(
        new ChangeProjectName({
          projectId,
          name: 'New name',
          userId,
          timestamp: Date.now(),
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('does not publish when repository save fails', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate());
    repo.failNextSave();

    await expect(
      handler.handleChangeDescription(
        new ChangeProjectDescription({
          projectId,
          description: 'New desc',
          userId,
          timestamp: Date.now(),
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('surfaces concurrency errors from repository', async () => {
    const { handler, repo } = setup();
    await handler.handleCreate(baseCreate());
    repo.failWith(new ConcurrencyError());

    await expect(
      handler.handleChangeDates(
        new ChangeProjectDates({
          projectId,
          startDate: '2025-01-02',
          targetDate: '2025-03-01',
          userId,
          timestamp: Date.now(),
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('rejects invalid payloads via ValidationException', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());
    await expect(
      handler.handleChangeStatus(
        new ChangeProjectStatus({
          projectId,
          status: 'not-a-status' as never,
          userId,
          timestamp: Date.now(),
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it('does not depend on userId for project updates', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    const commandWithoutUserId = {
      projectId,
      name: 'Updated name',
      timestamp: Date.now(),
      knownVersion: 1,
    } as unknown as ChangeProjectName;

    await expect(
      handler.handleChangeName(commandWithoutUserId)
    ).resolves.toBeDefined();
  });

  it('throws ConcurrencyError when knownVersion mismatches', async () => {
    const { handler } = setup();
    await handler.handleCreate(baseCreate());

    await expect(
      handler.handleChangeStatus(
        new ChangeProjectStatus({
          projectId,
          status: 'in_progress',
          userId,
          timestamp: Date.now(),
          knownVersion: 0,
        })
      )
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });
});
