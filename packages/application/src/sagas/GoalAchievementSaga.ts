import type { EventBusPort } from '../shared/ports/EventBusPort';
import { AchieveGoal, UnachieveGoal } from '../goals/commands';
import {
  ActorId,
  CorrelationId,
  DomainEvent,
  EventId,
  GoalArchived,
  GoalAchieved,
  GoalCreated,
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalPrioritized,
  GoalRecategorized,
  GoalRefined,
  GoalRescheduled,
  GoalUnachieved,
  GoalId,
  ProjectCreated,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectStatusTransitioned,
  Timestamp,
  projectEventTypes,
  goalEventTypes,
  type ProjectStatusValue,
} from '@mo/domain';
import type {
  GoalAchievementState,
  GoalAchievementStorePort,
  ProjectAchievementState,
} from './ports/GoalAchievementStorePort';

type DispatchAchieveGoal = (command: AchieveGoal) => Promise<void>;
type DispatchUnachieveGoal = (command: UnachieveGoal) => Promise<void>;

const emptyGoalState = (goalId: string): GoalAchievementState => ({
  goalId,
  linkedProjectIds: [],
  completedProjectIds: [],
  achieved: false,
  archived: false,
  achievementRequested: false,
  version: 0,
});

export class GoalAchievementSaga {
  private replaying = false;
  private readonly seenGoalIds = new Set<string>();

  constructor(
    private readonly store: GoalAchievementStorePort,
    private readonly seedEvents: () => Promise<DomainEvent[]>,
    private readonly dispatchAchieveGoal: DispatchAchieveGoal,
    private readonly dispatchUnachieveGoal: DispatchUnachieveGoal
  ) {}

  async bootstrap(): Promise<void> {
    const events = await this.seedEvents();
    this.seenGoalIds.clear();
    this.replaying = true;

    for (const event of events) {
      await this.handleEvent(event);
    }

    this.replaying = false;
    for (const goalId of this.seenGoalIds) {
      const state = await this.store.getGoalState(goalId);
      if (!state) continue;
      const systemEvent = this.systemEvent(goalId);
      await this.maybeAchieveGoal(state, systemEvent, { forceRetry: true });
      await this.maybeUnachieveGoal(state, systemEvent);
    }
  }

  async onRebaseRequired(): Promise<void> {
    await this.store.resetAll();
    await this.bootstrap();
  }

  subscribe(eventBus: EventBusPort): void {
    eventBus.subscribe(projectEventTypes.projectCreated, (event) =>
      this.handleEvent(event as ProjectCreated)
    );
    eventBus.subscribe(projectEventTypes.projectGoalAdded, (event) =>
      this.handleEvent(event as ProjectGoalAdded)
    );
    eventBus.subscribe(projectEventTypes.projectGoalRemoved, (event) =>
      this.handleEvent(event as ProjectGoalRemoved)
    );
    eventBus.subscribe(projectEventTypes.projectStatusTransitioned, (event) =>
      this.handleEvent(event as ProjectStatusTransitioned)
    );
    eventBus.subscribe(goalEventTypes.goalAchieved, (event) =>
      this.handleEvent(event as GoalAchieved)
    );
    eventBus.subscribe(goalEventTypes.goalUnachieved, (event) =>
      this.handleEvent(event as GoalUnachieved)
    );
    eventBus.subscribe(goalEventTypes.goalArchived, (event) =>
      this.handleEvent(event as GoalArchived)
    );
    eventBus.subscribe(goalEventTypes.goalCreated, (event) =>
      this.handleEvent(event as GoalCreated)
    );
    eventBus.subscribe(goalEventTypes.goalRefined, (event) =>
      this.handleEvent(event as GoalRefined)
    );
    eventBus.subscribe(goalEventTypes.goalRecategorized, (event) =>
      this.handleEvent(event as GoalRecategorized)
    );
    eventBus.subscribe(goalEventTypes.goalRescheduled, (event) =>
      this.handleEvent(event as GoalRescheduled)
    );
    eventBus.subscribe(goalEventTypes.goalPrioritized, (event) =>
      this.handleEvent(event as GoalPrioritized)
    );
    eventBus.subscribe(goalEventTypes.goalAccessGranted, (event) =>
      this.handleEvent(event as GoalAccessGranted)
    );
    eventBus.subscribe(goalEventTypes.goalAccessRevoked, (event) =>
      this.handleEvent(event as GoalAccessRevoked)
    );
  }

  private async handleEvent(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case projectEventTypes.projectCreated:
        await this.handleProjectCreated(event as ProjectCreated);
        return;
      case projectEventTypes.projectGoalAdded:
        await this.handleProjectGoalAdded(event as ProjectGoalAdded);
        return;
      case projectEventTypes.projectGoalRemoved:
        await this.handleProjectGoalRemoved(event as ProjectGoalRemoved);
        return;
      case projectEventTypes.projectStatusTransitioned:
        await this.handleProjectStatusTransitioned(
          event as ProjectStatusTransitioned
        );
        return;
      case goalEventTypes.goalAchieved:
        await this.handleGoalAchieved(event as GoalAchieved);
        return;
      case goalEventTypes.goalUnachieved:
        await this.handleGoalUnachieved(event as GoalUnachieved);
        return;
      case goalEventTypes.goalArchived:
        await this.handleGoalArchived(event as GoalArchived);
        return;
      case goalEventTypes.goalCreated:
      case goalEventTypes.goalRefined:
      case goalEventTypes.goalRecategorized:
      case goalEventTypes.goalRescheduled:
      case goalEventTypes.goalPrioritized:
      case goalEventTypes.goalAccessGranted:
      case goalEventTypes.goalAccessRevoked:
        await this.handleGoalEvent(
          event as
            | GoalCreated
            | GoalRefined
            | GoalRecategorized
            | GoalRescheduled
            | GoalPrioritized
            | GoalAccessGranted
            | GoalAccessRevoked
        );
    }
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
    this.seenGoalIds.add(goalId);
    const goalState = await this.ensureGoalState(goalId);
    this.addLinkedProject(goalState, projectId);
    if (status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    if (!this.replaying) {
      await this.maybeAchieveGoal(goalState, event, {
        forceRetry: goalState.achievementRequested,
      });
      await this.maybeUnachieveGoal(goalState, event);
    }
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
    this.seenGoalIds.add(goalId);
    if (!this.replaying) {
      await this.maybeAchieveGoal(goalState, event, {
        forceRetry: goalState.achievementRequested,
      });
      await this.maybeUnachieveGoal(goalState, event);
    }
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
    this.seenGoalIds.add(goalId);
    if (!this.replaying) {
      await this.maybeUnachieveGoal(goalState, event);
    }
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
    const goalId = projectState.goalId;
    this.seenGoalIds.add(goalId);
    const goalState = await this.ensureGoalState(goalId);
    this.addLinkedProject(goalState, projectId);
    if (status === 'completed') {
      this.addCompletedProject(goalState, projectId);
    } else {
      this.removeCompletedProject(goalState, projectId);
    }
    await this.store.saveGoalState(goalState);
    if (!this.replaying) {
      await this.maybeAchieveGoal(goalState, event, {
        forceRetry: goalState.achievementRequested,
      });
      await this.maybeUnachieveGoal(goalState, event);
    }
  }

  private async handleGoalEvent(
    event:
      | GoalCreated
      | GoalRefined
      | GoalRecategorized
      | GoalRescheduled
      | GoalPrioritized
      | GoalAccessGranted
      | GoalAccessRevoked
  ): Promise<void> {
    const goalId = event.aggregateId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.version = this.nextVersion(goalState.version);
    await this.store.saveGoalState(goalState);
    this.seenGoalIds.add(goalId);
  }

  private async handleGoalAchieved(event: GoalAchieved): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.achieved = true;
    goalState.achievementRequested = false;
    goalState.version = this.nextVersion(goalState.version);
    await this.store.saveGoalState(goalState);
    this.seenGoalIds.add(goalId);
  }

  private async handleGoalUnachieved(event: GoalUnachieved): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.achieved = false;
    goalState.achievementRequested = false;
    goalState.version = this.nextVersion(goalState.version);
    await this.store.saveGoalState(goalState);
    this.seenGoalIds.add(goalId);
  }

  private async handleGoalArchived(event: GoalArchived): Promise<void> {
    const goalId = event.goalId.value;
    const goalState = await this.ensureGoalState(goalId);
    goalState.archived = true;
    goalState.achievementRequested = false;
    goalState.version = this.nextVersion(goalState.version);
    await this.store.saveGoalState(goalState);
    this.seenGoalIds.add(goalId);
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
    event: DomainEvent,
    options?: { forceRetry?: boolean }
  ): Promise<void> {
    if (state.achieved) return;
    if (state.archived) return;
    if (state.linkedProjectIds.length === 0) return;
    const allCompleted = state.linkedProjectIds.every((projectId) =>
      state.completedProjectIds.includes(projectId)
    );
    if (!allCompleted) return;
    if (state.version <= 0) return;
    if (state.achievementRequested && !options?.forceRetry) return;

    const correlationId = event.correlationId?.value ?? event.eventId.value;
    const command = new AchieveGoal(
      {
        goalId: state.goalId,
        timestamp: event.occurredAt.value,
        knownVersion: state.version,
      },
      {
        actorId: event.actorId.value,
        idempotencyKey: `goal-achieve:${state.goalId}:${event.eventId.value}`,
        correlationId,
        causationId: event.eventId.value,
      }
    );

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

  private async maybeUnachieveGoal(
    state: GoalAchievementState,
    event: DomainEvent
  ): Promise<void> {
    if (!state.achieved && !state.achievementRequested) return;
    if (state.archived) return;
    if (state.linkedProjectIds.length === 0) return;
    const allCompleted = state.linkedProjectIds.every((projectId) =>
      state.completedProjectIds.includes(projectId)
    );
    if (allCompleted) return;
    if (state.version <= 0) return;

    const correlationId = event.correlationId?.value ?? event.eventId.value;
    const command = new UnachieveGoal(
      {
        goalId: state.goalId,
        timestamp: event.occurredAt.value,
        knownVersion: state.version,
      },
      {
        actorId: event.actorId.value,
        idempotencyKey: `goal-unachieve:${state.goalId}:${state.version}`,
        correlationId,
        causationId: event.eventId.value,
      }
    );

    await this.dispatchUnachieveGoal(command);
  }

  private nextVersion(current: number): number {
    return current + 1;
  }

  private systemEvent(goalId: string): DomainEvent {
    const actorId = ActorId.from('system');
    const occurredAt = Timestamp.fromMillis(Date.now());
    const eventId = EventId.create();
    return {
      eventType: 'SystemReconciliation',
      aggregateId: GoalId.from(goalId),
      actorId,
      occurredAt,
      eventId,
      correlationId: CorrelationId.from(eventId.value),
      causationId: eventId,
    };
  }
}
