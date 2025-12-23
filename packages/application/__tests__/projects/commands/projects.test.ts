import { describe, expect, it } from 'vitest';
import {
  CreateProject,
  ChangeProjectStatus,
  AddProjectMilestone,
  ArchiveProject,
} from '../../../src/projects/commands';
import { ProjectCommandHandler } from '../../../src/projects/ProjectCommandHandler';
import {
  InMemoryKeyStore,
  InMemoryProjectRepository,
  MockCryptoService,
} from '../../fixtures/ports';
import { ValidationException } from '../../../src/errors/ValidationError';

const now = Date.now();
const projectId = '018f7b1a-7c8a-72c4-a0ab-8234c2d6f201';
const userId = 'user-1';

const makeHandler = () =>
  new ProjectCommandHandler(
    new InMemoryProjectRepository(),
    new InMemoryKeyStore(),
    new MockCryptoService()
  );

const createProject = () =>
  new CreateProject({
    projectId,
    name: 'Project Alpha',
    status: 'planned',
    startDate: '2025-01-01',
    targetDate: '2025-02-01',
    description: 'desc',
    goalId: null,
    userId,
    timestamp: now,
  });

describe('Project commands', () => {
  it('are lean DTOs with payload assigned', () => {
    const cmd = createProject();
    expect(cmd.type).toBe('CreateProject');
    expect(cmd.projectId).toBe(projectId);
    expect(cmd.status).toBe('planned');
  });

  it('validates inside handler (status)', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createProject());
    await expect(
      handler.handleChangeStatus(
        new ChangeProjectStatus({
          projectId,
          status: 'invalid' as never,
          userId,
          timestamp: now,
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('validates inside handler (milestone name)', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createProject());

    await expect(
      handler.handleAddMilestone(
        new AddProjectMilestone({
          projectId,
          milestoneId: '018f7b1a-7c8a-72c4-a0ab-8234c2d6f202',
          name: '',
          targetDate: '2025-01-02',
          userId,
          timestamp: now,
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(Error);
  });

  it('validates inside handler (archive bad id)', async () => {
    const handler = makeHandler();
    await handler.handleCreate(createProject());
    await expect(
      handler.handleArchive(
        new ArchiveProject({
          projectId: 'not-a-uuid',
          userId,
          timestamp: now,
          knownVersion: 1,
        })
      )
    ).rejects.toBeInstanceOf(ValidationException);
  });
});
