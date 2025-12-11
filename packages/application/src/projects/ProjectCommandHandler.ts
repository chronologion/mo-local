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
import { IEventBus, ICryptoService, IKeyStore } from '../shared/ports';
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
    private readonly eventBus: IEventBus
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
    });
    const kProject = await this.crypto.generateKey();
    const project = Project.create({
      id: projectId,
      name,
      status,
      startDate,
      targetDate,
      description,
      goalId: goalId ?? undefined,
      createdBy: userId,
    });

    const pending = project.getUncommittedEvents();
    await this.keyStore.saveAggregateKey(project.id.value, kProject);
    await this.projectRepo.save(project, kProject);
    await this.eventBus.publish(pending);
    project.markEventsAsCommitted();
    return { projectId: project.id.value, encryptionKey: kProject };
  }

  async handleChangeStatus(
    command: ChangeProjectStatus
  ): Promise<ProjectCommandResult> {
    const { projectId, status } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      status: (c) => ProjectStatus.from(c.status),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeStatus(status);
    return this.persist(project);
  }

  async handleChangeDates(
    command: ChangeProjectDates
  ): Promise<ProjectCommandResult> {
    const { projectId, startDate, targetDate } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      startDate: (c) => LocalDate.fromString(c.startDate),
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeDates({ startDate, targetDate });
    return this.persist(project);
  }

  async handleChangeName(
    command: ChangeProjectName
  ): Promise<ProjectCommandResult> {
    const { projectId, name } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      name: (c) => ProjectName.from(c.name),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeName(name);
    return this.persist(project);
  }

  async handleChangeDescription(
    command: ChangeProjectDescription
  ): Promise<ProjectCommandResult> {
    const { projectId, description } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      description: (c) => ProjectDescription.from(c.description),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeDescription(description);
    return this.persist(project);
  }

  async handleAddGoal(command: AddProjectGoal): Promise<ProjectCommandResult> {
    const { projectId, goalId } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      goalId: (c) => GoalId.from(c.goalId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.addGoal(goalId);
    return this.persist(project);
  }

  async handleRemoveGoal(
    command: RemoveProjectGoal
  ): Promise<ProjectCommandResult> {
    const { projectId } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.removeGoal();
    return this.persist(project);
  }

  async handleAddMilestone(
    command: AddProjectMilestone
  ): Promise<ProjectCommandResult> {
    const { projectId, milestoneId, name, targetDate } = this.parseCommand(
      command,
      {
        projectId: (c) => ProjectId.from(c.projectId),
        milestoneId: (c) => MilestoneId.from(c.milestoneId),
        name: (c) => c.name,
        targetDate: (c) => LocalDate.fromString(c.targetDate),
        userId: (c) => UserId.from(c.userId),
        timestamp: (c) => this.parseTimestamp(c.timestamp),
      }
    );
    const project = await this.loadProject(projectId);
    project.addMilestone({
      id: milestoneId,
      name,
      targetDate,
    });
    return this.persist(project);
  }

  async handleChangeMilestoneTargetDate(
    command: ChangeProjectMilestoneTargetDate
  ): Promise<ProjectCommandResult> {
    const { projectId, milestoneId, targetDate } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      targetDate: (c) => LocalDate.fromString(c.targetDate),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeMilestoneTargetDate(milestoneId, targetDate);
    return this.persist(project);
  }

  async handleChangeMilestoneName(
    command: ChangeProjectMilestoneName
  ): Promise<ProjectCommandResult> {
    const { projectId, milestoneId, name } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      name: (c) => c.name,
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.changeMilestoneName(milestoneId, name);
    return this.persist(project);
  }

  async handleArchiveMilestone(
    command: ArchiveProjectMilestone
  ): Promise<ProjectCommandResult> {
    const { projectId, milestoneId } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      milestoneId: (c) => MilestoneId.from(c.milestoneId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.archiveMilestone(milestoneId);
    return this.persist(project);
  }

  async handleArchive(command: ArchiveProject): Promise<ProjectCommandResult> {
    const { projectId } = this.parseCommand(command, {
      projectId: (c) => ProjectId.from(c.projectId),
      userId: (c) => UserId.from(c.userId),
      timestamp: (c) => this.parseTimestamp(c.timestamp),
    });
    const project = await this.loadProject(projectId);
    project.archive();
    return this.persist(project);
  }

  private parseTimestamp(timestamp: number): Date {
    if (!Number.isFinite(timestamp)) {
      throw new Error('Timestamp must be a finite number');
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Timestamp is not a valid date');
    }
    return date;
  }

  private async loadProject(projectId: ProjectId): Promise<Project> {
    const project = await this.projectRepo.load(projectId);
    if (!project) {
      throw new NotFoundError(`Project ${projectId.value} not found`);
    }
    return project;
  }

  private async persist(project: Project): Promise<ProjectCommandResult> {
    const pendingEvents = project.getUncommittedEvents();
    const kProject = await this.keyStore.getAggregateKey(project.id.value);
    if (!kProject) {
      throw new NotFoundError(
        `Aggregate key for ${project.id.value} not found`
      );
    }
    await this.projectRepo.save(project, kProject);
    await this.eventBus.publish(pendingEvents);
    project.markEventsAsCommitted();
    return { projectId: project.id.value };
  }
}
