import { Project, ProjectId } from '@mo/domain';
import {
  ValidatedCreateProjectCommand,
  ValidatedChangeProjectStatusCommand,
  ValidatedChangeProjectDatesCommand,
  ValidatedChangeProjectNameCommand,
  ValidatedChangeProjectDescriptionCommand,
  ValidatedAddProjectGoalCommand,
  ValidatedRemoveProjectGoalCommand,
  ValidatedAddProjectMilestoneCommand,
  ValidatedChangeProjectMilestoneTargetDateCommand,
  ValidatedChangeProjectMilestoneNameCommand,
  ValidatedArchiveProjectMilestoneCommand,
  ValidatedArchiveProjectCommand,
} from './commands';
import { IProjectRepository } from './ports/IProjectRepository';
import { IEventBus, ICryptoService, IKeyStore } from '../shared/ports';
import { NotFoundError } from '../errors/NotFoundError';

export type ProjectCommandResult =
  | { projectId: string; encryptionKey: Uint8Array }
  | { projectId: string };

export class ProjectCommandHandler {
  constructor(
    private readonly projectRepo: IProjectRepository,
    private readonly keyStore: IKeyStore,
    private readonly crypto: ICryptoService,
    private readonly eventBus: IEventBus
  ) {}

  async handleCreate(
    command: ValidatedCreateProjectCommand
  ): Promise<ProjectCommandResult> {
    const kProject = await this.crypto.generateKey();
    const project = Project.create({
      id: command.projectId,
      name: command.name,
      status: command.status,
      startDate: command.startDate,
      targetDate: command.targetDate,
      description: command.description,
      goalId: command.goalId ?? undefined,
      createdBy: command.userId,
    });

    const pending = project.getUncommittedEvents();
    await this.keyStore.saveAggregateKey(project.id.value, kProject);
    await this.projectRepo.save(project, kProject);
    await this.eventBus.publish(pending);
    project.markEventsAsCommitted();
    return { projectId: project.id.value, encryptionKey: kProject };
  }

  async handleChangeStatus(
    command: ValidatedChangeProjectStatusCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeStatus(command.status);
    return this.persist(project);
  }

  async handleChangeDates(
    command: ValidatedChangeProjectDatesCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeDates({
      startDate: command.startDate,
      targetDate: command.targetDate,
    });
    return this.persist(project);
  }

  async handleChangeName(
    command: ValidatedChangeProjectNameCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeName(command.name);
    return this.persist(project);
  }

  async handleChangeDescription(
    command: ValidatedChangeProjectDescriptionCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeDescription(command.description);
    return this.persist(project);
  }

  async handleAddGoal(
    command: ValidatedAddProjectGoalCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.addGoal(command.goalId);
    return this.persist(project);
  }

  async handleRemoveGoal(
    command: ValidatedRemoveProjectGoalCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.removeGoal();
    return this.persist(project);
  }

  async handleAddMilestone(
    command: ValidatedAddProjectMilestoneCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.addMilestone({
      id: command.milestoneId,
      name: command.name,
      targetDate: command.targetDate,
    });
    return this.persist(project);
  }

  async handleChangeMilestoneTargetDate(
    command: ValidatedChangeProjectMilestoneTargetDateCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeMilestoneTargetDate(command.milestoneId, command.targetDate);
    return this.persist(project);
  }

  async handleChangeMilestoneName(
    command: ValidatedChangeProjectMilestoneNameCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.changeMilestoneName(command.milestoneId, command.name);
    return this.persist(project);
  }

  async handleArchiveMilestone(
    command: ValidatedArchiveProjectMilestoneCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.archiveMilestone(command.milestoneId);
    return this.persist(project);
  }

  async handleArchive(
    command: ValidatedArchiveProjectCommand
  ): Promise<ProjectCommandResult> {
    const project = await this.loadProject(command.projectId);
    project.archive();
    return this.persist(project);
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
