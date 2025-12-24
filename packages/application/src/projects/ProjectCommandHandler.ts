import {
  Project,
  ProjectId,
  ProjectName,
  ProjectStatus,
  ProjectDescription,
  LocalDate,
  GoalId,
  MilestoneId,
  UserId,
  Timestamp,
} from '@mo/domain';
import {
  CreateProject,
  ChangeProjectStatus,
  ChangeProjectDates,
  ChangeProjectName,
  ChangeProjectDescription,
  AddProjectGoal,
  RemoveProjectGoal,
  AddProjectMilestone,
  ChangeProjectMilestoneTargetDate,
  ChangeProjectMilestoneName,
  ArchiveProjectMilestone,
  ArchiveProject,
} from './commands';
import { IProjectRepository } from './ports/IProjectRepository';
import { ICryptoService, IIdempotencyStore, IKeyStore } from '../shared/ports';
import { NotFoundError } from '../errors/NotFoundError';
import { BaseCommandHandler } from '../shared/ports/BaseCommandHandler';

export type ProjectCommandResult =
  | { projectId: string; encryptionKey: Uint8Array }
  | { projectId: string };

export class ProjectCommandHandler extends BaseCommandHandler {
  constructor(
    private readonly projectRepo: IProjectRepository,
    private readonly keyStore: IKeyStore,
    private readonly crypto: ICryptoService,
    private readonly idempotencyStore: IIdempotencyStore
  ) {
    super();
  }

  async handleCreate(command: CreateProject): Promise<ProjectCommandResult> {
    const {
      projectId,
      name,
      status,
      startDate,
      targetDate,
      description,
      goalId,
      userId,
      timestamp,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      name: (c) => ProjectName.from(c.name),
      status: (c) => ProjectStatus.from(c.status),
      startDate: (c) => LocalDate.fromString(c.startDate),
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      description: (c) => ProjectDescription.from(c.description ?? ''),
      goalId: (c) =>
        c.goalId === undefined || c.goalId === null
          ? null
          : GoalId.from(c.goalId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    const isDuplicate = await this.isDuplicateCommand({
      idempotencyKey,
      commandType: command.type,
      aggregateId: projectId.value,
    });
    if (isDuplicate) {
      const existingKey = await this.keyStore.getAggregateKey(projectId.value);
      if (!existingKey) {
        throw new NotFoundError(
          `Aggregate key for ${projectId.value} not found`
        );
      }
      return { projectId: projectId.value, encryptionKey: existingKey };
    }

    const existingKey = await this.keyStore.getAggregateKey(projectId.value);
    if (existingKey) {
      const existingProject = await this.projectRepo.load(projectId);
      if (existingProject.kind === 'some') {
        return { projectId: projectId.value, encryptionKey: existingKey };
      }
    }

    const kProject = existingKey ?? (await this.crypto.generateKey());
    const project = Project.create({
      id: projectId,
      name,
      status,
      startDate,
      targetDate,
      description,
      goalId: goalId ?? undefined,
      createdBy: userId,
      createdAt: timestamp,
    });

    if (!existingKey) {
      await this.keyStore.saveAggregateKey(project.id.value, kProject);
    }
    await this.projectRepo.save(project, kProject);
    project.markEventsAsCommitted();
    await this.idempotencyStore.record({
      key: idempotencyKey,
      commandType: command.type,
      aggregateId: projectId.value,
      createdAt: timestamp.value,
    });
    return { projectId: project.id.value, encryptionKey: kProject };
  }

  async handleChangeStatus(
    command: ChangeProjectStatus
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      status,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      status: (c) => ProjectStatus.from(c.status),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeStatus({ status, changedAt: timestamp, actorId: userId });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleChangeDates(
    command: ChangeProjectDates
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      startDate,
      targetDate,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      startDate: (c) => LocalDate.fromString(c.startDate),
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeDates({
      startDate,
      targetDate,
      changedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleChangeName(
    command: ChangeProjectName
  ): Promise<ProjectCommandResult> {
    const { projectId, name, userId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        projectId: (c) => ProjectId.from(c.projectId),
        name: (c) => ProjectName.from(c.name),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeName({ name, changedAt: timestamp, actorId: userId });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleChangeDescription(
    command: ChangeProjectDescription
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      description,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      description: (c) => ProjectDescription.from(c.description),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeDescription({
      description,
      changedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleAddGoal(command: AddProjectGoal): Promise<ProjectCommandResult> {
    const {
      projectId,
      goalId,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      goalId: (c) => GoalId.from(c.goalId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.addGoal({ goalId, addedAt: timestamp, actorId: userId });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleRemoveGoal(
    command: RemoveProjectGoal
  ): Promise<ProjectCommandResult> {
    const { projectId, userId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        projectId: (c) => ProjectId.from(c.projectId),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.removeGoal({ removedAt: timestamp, actorId: userId });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleAddMilestone(
    command: AddProjectMilestone
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      milestoneId,
      name,
      targetDate,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      name: (c) => c.name,
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.addMilestone({
      id: milestoneId,
      name,
      targetDate,
      addedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleChangeMilestoneTargetDate(
    command: ChangeProjectMilestoneTargetDate
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      milestoneId,
      targetDate,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeMilestoneTargetDate({
      milestoneId,
      targetDate,
      changedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleChangeMilestoneName(
    command: ChangeProjectMilestoneName
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      milestoneId,
      name,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      name: (c) => c.name,
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.changeMilestoneName({
      milestoneId,
      name,
      changedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleArchiveMilestone(
    command: ArchiveProjectMilestone
  ): Promise<ProjectCommandResult> {
    const {
      projectId,
      milestoneId,
      userId,
      timestamp,
      knownVersion,
      idempotencyKey,
    } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
      knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
      idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
    });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.archiveMilestone({
      milestoneId,
      archivedAt: timestamp,
      actorId: userId,
    });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  async handleArchive(command: ArchiveProject): Promise<ProjectCommandResult> {
    const { projectId, userId, timestamp, knownVersion, idempotencyKey } =
      this.parseCommand(command, {
        projectId: (c) => ProjectId.from(c.projectId),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
        knownVersion: (c) => this.parseKnownVersion(c.knownVersion),
        idempotencyKey: (c) => this.parseIdempotencyKey(c.idempotencyKey),
      });

    if (
      await this.isDuplicateCommand({
        idempotencyKey,
        commandType: command.type,
        aggregateId: projectId.value,
      })
    ) {
      return { projectId: projectId.value };
    }
    const project = await this.loadProject(projectId);
    this.assertKnownVersion({
      actual: project.version,
      expected: knownVersion,
      aggregateType: 'Project',
      aggregateId: project.id.value,
    });
    project.archive({ archivedAt: timestamp, actorId: userId });
    return this.persist(project, {
      idempotencyKey,
      commandType: command.type,
      createdAt: timestamp.value,
    });
  }

  private parseTimestamp(timestamp: number): Timestamp {
    if (!Number.isFinite(timestamp)) {
      throw new Error('Timestamp must be a finite number');
    }
    return Timestamp.fromMillis(timestamp);
  }

  private async loadProject(projectId: ProjectId): Promise<Project> {
    const project = await this.projectRepo.load(projectId);
    if (project.kind === 'none') {
      throw new NotFoundError(`Project ${projectId.value} not found`);
    }
    return project.value;
  }

  private async isDuplicateCommand(params: {
    idempotencyKey: string;
    commandType: string;
    aggregateId: string;
  }): Promise<boolean> {
    const existing = await this.idempotencyStore.get(params.idempotencyKey);
    if (!existing) return false;
    this.assertIdempotencyRecord({
      existing,
      expectedCommandType: params.commandType,
      expectedAggregateId: params.aggregateId,
    });
    return true;
  }

  private async persist(
    project: Project,
    idempotency: {
      idempotencyKey: string;
      commandType: string;
      createdAt: number;
    }
  ): Promise<ProjectCommandResult> {
    const kProject = await this.keyStore.getAggregateKey(project.id.value);
    if (!kProject) {
      throw new NotFoundError(
        `Aggregate key for ${project.id.value} not found`
      );
    }
    await this.projectRepo.save(project, kProject);
    project.markEventsAsCommitted();
    await this.idempotencyStore.record({
      key: idempotency.idempotencyKey,
      commandType: idempotency.commandType,
      aggregateId: project.id.value,
      createdAt: idempotency.createdAt,
    });
    return { projectId: project.id.value };
  }
}
