import type { IEventBus } from '../shared/ports/IEventBus';
import type { IGoalReadModel } from '../goals/ports/IGoalReadModel';
import { AchieveGoal } from '../goals/commands';
import {
  GoalAchieved,
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
    private readonly goalReadModel: IGoalReadModel,
    private readonly dispatchAchieveGoal: DispatchAchieveGoal
  ) {}

  subscribe(eventBus: IEventBus): void {
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
  }

  private async handleProjectGoalAdded(event: ProjectGoalAdded): Promise<void> {
    const projectId = event.projectId.value;
    const goalId = event.goalId.value;
    const projectState =
      (await this.store.getProjectState(projectId)) ??
      this.emptyProjectState(projectId);
    projectState.goalId = goalId;
    await this.store.saveProjectState(projectState);

    const goalState = await this.ensureGoalState(goalId);
    this.addLinkedProject(goalState, projectId);
    if (projectState.status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    await this.maybeAchieveGoal(goalState, event);
  }

  private async handleProjectGoalRemoved(
    event: ProjectGoalRemoved
  ): Promise<void> {
    const projectId = event.projectId.value;
    const projectState =
      (await this.store.getProjectState(projectId)) ??
      this.emptyProjectState(projectId);
    const goalId = projectState.goalId;
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
    await this.store.saveProjectState(projectState);

    if (!projectState.goalId) return;
    const goalState = await this.ensureGoalState(projectState.goalId);
    if (status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    } else {
      this.removeCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    await this.maybeAchieveGoal(goalState, event);
  }

  private async handleGoalAchieved(event: GoalAchieved): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.achieved = true;
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
    event: { actorId: { value: string }; occurredAt: { value: number } }
  ): Promise<void> {
    if (state.achieved || state.achievementRequested) return;
    if (state.linkedProjectIds.length === 0) return;
    const allCompleted = state.linkedProjectIds.every((projectId) =>
      state.completedProjectIds.includes(projectId)
    );
    if (!allCompleted) return;

    const goal = await this.goalReadModel.getById(state.goalId);
    if (!goal) return;
    if (goal.archivedAt !== null || goal.achievedAt !== null) {
      state.achieved = goal.achievedAt !== null;
      await this.store.saveGoalState(state);
      return;
    }

    const command = new AchieveGoal({
      goalId: state.goalId,
      userId: event.actorId.value,
      timestamp: event.occurredAt.value,
      knownVersion: goal.version,
      idempotencyKey: `goal-achieve:${state.goalId}`,
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
