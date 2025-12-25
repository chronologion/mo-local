import type { IEventBus } from '../shared/ports/IEventBus';
import type { IGoalRepository } from '../goals/ports/IGoalRepository';
import type { IProjectReadModel } from '../projects/ports/IProjectReadModel';
import { AchieveGoal } from '../goals/commands';
import {
  EventId,
  GoalAchieved,
  GoalUnachieved,
  GoalId,
  ProjectCreated,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectStatusTransitioned,
  projectEventTypes,
  goalEventTypes,
  type ProjectStatusValue,
} from '@mo/domain';
import type {
  GoalAchievementState,
  IGoalAchievementStore,
  ProjectAchievementState,
} from './ports/IGoalAchievementStore';

type DispatchAchieveGoal = (command: AchieveGoal) => Promise<void>;

const emptyGoalState = (goalId: string): GoalAchievementState => ({
  goalId,
  linkedProjectIds: [],
  completedProjectIds: [],
  achieved: false,
  achievementRequested: false,
});

export class GoalAchievementSaga {
  constructor(
    private readonly store: IGoalAchievementStore,
    private readonly goalRepo: IGoalRepository,
    private readonly projectReadModel: IProjectReadModel,
    private readonly dispatchAchieveGoal: DispatchAchieveGoal
  ) {}

  async bootstrap(): Promise<void> {
    const projects = await this.projectReadModel.list();
    const goalStates = new Map<string, GoalAchievementState>();

    for (const project of projects) {
      if (project.archivedAt !== null) continue;
      const goalId = project.goalId;
      const projectState: ProjectAchievementState = {
        projectId: project.id,
        goalId,
        status: project.status,
      };
      await this.store.saveProjectState(projectState);
      if (!goalId) continue;

      const goalState =
        goalStates.get(goalId) ?? (await this.ensureGoalState(goalId));
      this.addLinkedProject(goalState, project.id);
      if (project.status === 'completed') {
        this.addCompletedProject(goalState, project.id);
      }
      goalStates.set(goalId, goalState);
    }

    for (const [, state] of goalStates.entries()) {
      await this.store.saveGoalState(state);
      await this.maybeAchieveGoal(
        state,
        {
          actorId: { value: 'system' },
          occurredAt: { value: Date.now() },
          eventId: EventId.create(),
        },
        { forceRetry: true }
      );
    }
  }

  subscribe(eventBus: IEventBus): void {
    eventBus.subscribe(projectEventTypes.projectCreated, (event) =>
      this.handleProjectCreated(event as ProjectCreated)
    );
    eventBus.subscribe(projectEventTypes.projectGoalAdded, (event) =>
      this.handleProjectGoalAdded(event as ProjectGoalAdded)
    );
    eventBus.subscribe(projectEventTypes.projectGoalRemoved, (event) =>
      this.handleProjectGoalRemoved(event as ProjectGoalRemoved)
    );
    eventBus.subscribe(projectEventTypes.projectStatusTransitioned, (event) =>
      this.handleProjectStatusTransitioned(event as ProjectStatusTransitioned)
    );
    eventBus.subscribe(goalEventTypes.goalAchieved, (event) =>
      this.handleGoalAchieved(event as GoalAchieved)
    );
    eventBus.subscribe(goalEventTypes.goalUnachieved, (event) =>
      this.handleGoalUnachieved(event as GoalUnachieved)
    );
  }

  private async handleProjectCreated(event: ProjectCreated): Promise<void> {
    const projectId = event.projectId.value;
    const goalId = event.goalId?.value ?? null;
    const status = event.status.value as ProjectStatusValue;
    const projectState: ProjectAchievementState = {
      projectId,
      goalId,
      status,
    };
    await this.store.saveProjectState(projectState);

    if (!goalId) return;
    const goalState = await this.ensureGoalState(goalId);
    this.addLinkedProject(goalState, projectId);
    if (status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    await this.maybeAchieveGoal(goalState, event, {
      forceRetry: goalState.achievementRequested,
    });
  }

  private async handleProjectGoalAdded(event: ProjectGoalAdded): Promise<void> {
    const projectId = event.projectId.value;
    const goalId = event.goalId.value;
    const projectState =
      (await this.store.getProjectState(projectId)) ??
      this.emptyProjectState(projectId);
    projectState.goalId = goalId;
    if (!projectState.status) {
      const project = await this.projectReadModel.getById(projectId);
      projectState.status = project?.status ?? null;
    }
    await this.store.saveProjectState(projectState);

    const goalState = await this.ensureGoalState(goalId);
    this.addLinkedProject(goalState, projectId);
    if (projectState.status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    await this.maybeAchieveGoal(goalState, event, {
      forceRetry: goalState.achievementRequested,
    });
  }

  private async handleProjectGoalRemoved(
    event: ProjectGoalRemoved
  ): Promise<void> {
    const projectId = event.projectId.value;
    const projectState =
      (await this.store.getProjectState(projectId)) ??
      this.emptyProjectState(projectId);
    const goalId = projectState.goalId;
    if (!goalId) {
      await this.store.removeProjectState(projectId);
      return;
    }
    projectState.goalId = null;
    await this.store.saveProjectState(projectState);

    if (!goalId) return;
    const goalState = await this.ensureGoalState(goalId);
    this.removeLinkedProject(goalState, projectId);
    await this.store.saveGoalState(goalState);
  }

  private async handleProjectStatusTransitioned(
    event: ProjectStatusTransitioned
  ): Promise<void> {
    const projectId = event.projectId.value;
    const status = event.status.value as ProjectStatusValue;
    const projectState =
      (await this.store.getProjectState(projectId)) ??
      this.emptyProjectState(projectId);
    projectState.status = status;

    let derivedFromReadModel = false;
    if (!projectState.goalId) {
      const project = await this.projectReadModel.getById(projectId);
      projectState.goalId = project?.goalId ?? null;
      derivedFromReadModel = project !== null;
    }
    await this.store.saveProjectState(projectState);

    if (!projectState.goalId) return;
    const goalId = projectState.goalId;
    const goalState = await this.ensureGoalState(goalId);

    if (derivedFromReadModel) {
      const projects = await this.projectReadModel.list();
      const linked = projects
        .filter((p) => p.archivedAt === null)
        .filter((p) => p.goalId === goalId);
      goalState.linkedProjectIds = linked.map((p) => p.id);
      const completed: string[] = [];
      for (const linkedProjectId of goalState.linkedProjectIds) {
        const existing = await this.store.getProjectState(linkedProjectId);
        const fallback = linked.find((p) => p.id === linkedProjectId);
        const effectiveStatus = existing?.status ?? fallback?.status ?? null;
        if (effectiveStatus === 'completed') {
          completed.push(linkedProjectId);
        }
      }
      goalState.completedProjectIds = completed;
      // Apply the just-received status transition on top of potentially stale read-model data.
      if (status === 'completed')
        this.addCompletedProject(goalState, projectId);
      else this.removeCompletedProject(goalState, projectId);
    } else {
      this.addLinkedProject(goalState, projectId);
      if (status === 'completed') {
        this.addCompletedProject(goalState, projectId);
      } else {
        this.removeCompletedProject(goalState, projectId);
      }
    }
    await this.store.saveGoalState(goalState);
    await this.maybeAchieveGoal(goalState, event, {
      forceRetry: goalState.achievementRequested,
    });
  }

  private async handleGoalAchieved(event: GoalAchieved): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.achieved = true;
    goalState.achievementRequested = false;
    await this.store.saveGoalState(goalState);
  }

  private async handleGoalUnachieved(event: GoalUnachieved): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.achieved = false;
    goalState.achievementRequested = false;
    await this.store.saveGoalState(goalState);
  }

  private async ensureGoalState(goalId: string): Promise<GoalAchievementState> {
    return (await this.store.getGoalState(goalId)) ?? emptyGoalState(goalId);
  }

  private emptyProjectState(projectId: string): ProjectAchievementState {
    return { projectId, goalId: null, status: null };
  }

  private addLinkedProject(
    state: GoalAchievementState,
    projectId: string
  ): void {
    if (!state.linkedProjectIds.includes(projectId)) {
      state.linkedProjectIds = [...state.linkedProjectIds, projectId];
    }
  }

  private removeLinkedProject(
    state: GoalAchievementState,
    projectId: string
  ): void {
    state.linkedProjectIds = state.linkedProjectIds.filter(
      (id) => id !== projectId
    );
    state.completedProjectIds = state.completedProjectIds.filter(
      (id) => id !== projectId
    );
  }

  private addCompletedProject(
    state: GoalAchievementState,
    projectId: string
  ): void {
    if (!state.completedProjectIds.includes(projectId)) {
      state.completedProjectIds = [...state.completedProjectIds, projectId];
    }
  }

  private removeCompletedProject(
    state: GoalAchievementState,
    projectId: string
  ): void {
    state.completedProjectIds = state.completedProjectIds.filter(
      (id) => id !== projectId
    );
  }

  private async maybeAchieveGoal(
    state: GoalAchievementState,
    event: {
      actorId: { value: string };
      occurredAt: { value: number };
      eventId: { value: string };
    },
    options?: { forceRetry?: boolean }
  ): Promise<void> {
    if (state.achieved) return;
    if (state.linkedProjectIds.length === 0) return;
    const allCompleted = state.linkedProjectIds.every((projectId) =>
      state.completedProjectIds.includes(projectId)
    );
    if (!allCompleted) return;

    const goalOption = await this.goalRepo.load(GoalId.from(state.goalId));
    if (goalOption.kind === 'none') return;
    const goal = goalOption.value;
    if (goal.isArchived || goal.isAchieved) {
      state.achieved = goal.isAchieved;
      state.achievementRequested = false;
      await this.store.saveGoalState(state);
      return;
    }
    if (state.achievementRequested && !options?.forceRetry) return;

    const command = new AchieveGoal({
      goalId: state.goalId,
      userId: event.actorId.value,
      timestamp: event.occurredAt.value,
      knownVersion: goal.version,
      idempotencyKey: `goal-achieve:${state.goalId}:${event.eventId.value}`,
    });

    state.achievementRequested = true;
    await this.store.saveGoalState(state);
    try {
      await this.dispatchAchieveGoal(command);
    } catch (error) {
      state.achievementRequested = false;
      await this.store.saveGoalState(state);
      throw error;
    }
  }
}
