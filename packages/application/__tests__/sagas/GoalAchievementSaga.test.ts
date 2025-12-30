import { describe, expect, it } from 'vitest';
import {
  GoalAchievementSaga,
  type GoalAchievementState,
  type GoalAchievementCursor,
  type GoalAchievementStorePort,
  type ProjectAchievementState,
} from '../../src/sagas';
import type { EventBusPort } from '../../src/shared/ports/EventBusPort';
import type { EventHandler } from '../../src/shared/ports/types';
import { UnachieveGoal } from '../../src/goals/commands/UnachieveGoal';
import {
  ActorId,
  DomainEvent,
  EventId,
  GoalId,
  GoalAchieved,
  GoalCreated,
  GoalUnachieved,
  LocalDate,
  Month,
  Priority,
  ProjectCreated,
  ProjectDescription,
  ProjectId,
  ProjectName,
  ProjectStatus,
  ProjectStatusTransitioned,
  Slice,
  Summary,
  Timestamp,
  UserId,
} from '@mo/domain';

class InMemoryGoalAchievementStore implements GoalAchievementStorePort {
  private readonly goals = new Map<string, GoalAchievementState>();
  private readonly projects = new Map<string, ProjectAchievementState>();

  async getGoalState(goalId: string): Promise<GoalAchievementState | null> {
    return this.goals.get(goalId) ?? null;
  }

  async saveGoalState(
    state: GoalAchievementState,
    _cursor?: GoalAchievementCursor
  ): Promise<void> {
    this.goals.set(state.goalId, { ...state });
  }

  async getProjectState(
    projectId: string
  ): Promise<ProjectAchievementState | null> {
    return this.projects.get(projectId) ?? null;
  }

  async saveProjectState(
    state: ProjectAchievementState,
    _cursor?: GoalAchievementCursor
  ): Promise<void> {
    this.projects.set(state.projectId, { ...state });
  }

  async removeProjectState(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }

  async resetAll(): Promise<void> {
    this.goals.clear();
    this.projects.clear();
  }
}

class InMemoryEventBus implements EventBusPort {
  private readonly handlers = new Map<string, EventHandler[]>();

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const listeners = this.handlers.get(event.eventType) ?? [];
      await Promise.all(listeners.map((handler) => handler(event)));
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }
}

const seedEvents =
  (events: DomainEvent[]) => async (): Promise<DomainEvent[]> => {
    return events;
  };

const dispatchNoop = async () => undefined;

describe('GoalAchievementSaga', () => {
  it('dispatches AchieveGoal when all linked projects are completed on bootstrap', async () => {
    const goalId = '00000000-0000-0000-0000-000000000001';
    const store = new InMemoryGoalAchievementStore();
    const goalCreated = new GoalCreated(
      {
        goalId: GoalId.from(goalId),
        slice: Slice.from('Work'),
        summary: Summary.from('Complete projects'),
        targetMonth: Month.from('2025-03'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const projectOne = new ProjectCreated(
      {
        projectId: ProjectId.from('project-1'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const projectTwo = new ProjectCreated(
      {
        projectId: ProjectId.from('project-2'),
        name: ProjectName.from('Project Two'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const dispatched: string[] = [];

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([goalCreated, projectOne, projectTwo]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );

    await saga.bootstrap();

    expect(dispatched).toEqual([goalId]);
    const state = await store.getGoalState(goalId);
    expect(state?.achievementRequested).toBe(true);
  });

  it('reconciles achieved goals to unachieved when linked projects are incomplete', async () => {
    const goalId = '00000000-0000-0000-0000-000000000050';
    const store = new InMemoryGoalAchievementStore();
    const goalCreated = new GoalCreated(
      {
        goalId: GoalId.from(goalId),
        slice: Slice.from('Work'),
        summary: Summary.from('Complete projects'),
        targetMonth: Month.from('2025-03'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const projectCreated = new ProjectCreated(
      {
        projectId: ProjectId.from('project-1'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.InProgress,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const goalAchieved = new GoalAchieved(
      {
        goalId: GoalId.from(goalId),
        achievedAt: Timestamp.fromMillis(10),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    const dispatchedUnachieve: UnachieveGoal[] = [];

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([goalCreated, projectCreated, goalAchieved]),
      dispatchNoop,
      async (command) => {
        dispatchedUnachieve.push(command);
      }
    );

    await saga.onRebaseRequired();

    expect(dispatchedUnachieve).toHaveLength(1);
    expect(dispatchedUnachieve[0]?.goalId).toBe(goalId);
  });

  it('dispatches AchieveGoal when a completed project is created with a goal', async () => {
    const goalId = '00000000-0000-0000-0000-000000000001';
    const store = new InMemoryGoalAchievementStore();
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

    const goalCreated = new GoalCreated(
      {
        goalId: GoalId.from(goalId),
        slice: Slice.from('Work'),
        summary: Summary.from('Complete project'),
        targetMonth: Month.from('2025-03'),
        priority: Priority.from('must'),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([goalCreated]);

    const projectCreated = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000002'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );

    await eventBus.publish([projectCreated]);

    expect(dispatched).toEqual([goalId]);
    const state = await store.getGoalState(goalId);
    expect(state?.achievementRequested).toBe(true);
  });

  it('re-achieves after manual unachieve when all linked projects are completed', async () => {
    const goalId = '00000000-0000-0000-0000-000000000010';
    const store = new InMemoryGoalAchievementStore();
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

    await eventBus.publish([
      new GoalCreated(
        {
          goalId: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete projects'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    const projectOne = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000011'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectOne]);
    expect(dispatched).toEqual([goalId]);

    const unachievedAt = Timestamp.fromMillis(2000);
    const unachievedEvent = new GoalUnachieved(
      { goalId: GoalId.from(goalId), unachievedAt },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([unachievedEvent]);

    const projectTwo = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000012'),
        name: ProjectName.from('Project Two'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(3000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectTwo]);

    expect(dispatched).toEqual([goalId, goalId]);
  });

  it('achieves after linking and later completing a second project', async () => {
    const goalId = '00000000-0000-0000-0000-000000000020';
    const store = new InMemoryGoalAchievementStore();
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

    await eventBus.publish([
      new GoalCreated(
        {
          goalId: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete projects'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    const projectOne = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000021'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectOne]);
    expect(dispatched).toEqual([goalId]);

    const unachievedAt = Timestamp.fromMillis(2000);
    const unachievedEvent = new GoalUnachieved(
      { goalId: GoalId.from(goalId), unachievedAt },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([unachievedEvent]);

    const projectTwo = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000022'),
        name: ProjectName.from('Project Two'),
        status: ProjectStatus.InProgress,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(3000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectTwo]);

    const projectTwoCompleted = new ProjectStatusTransitioned(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000022'),
        status: ProjectStatus.Completed,
        changedAt: Timestamp.fromMillis(4000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectTwoCompleted]);

    expect(dispatched).toEqual([goalId, goalId]);
  });

  it('achieves after status transitions when projects are already linked', async () => {
    const goalId = '00000000-0000-0000-0000-000000000040';
    const projectOneId = '00000000-0000-0000-0000-000000000041';
    const projectTwoId = '00000000-0000-0000-0000-000000000042';
    const store = new InMemoryGoalAchievementStore();
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

    await eventBus.publish([
      new GoalCreated(
        {
          goalId: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete projects'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    await eventBus.publish([
      new ProjectCreated(
        {
          projectId: ProjectId.from(projectOneId),
          name: ProjectName.from('Project One'),
          status: ProjectStatus.InProgress,
          startDate: LocalDate.fromString('2025-01-01'),
          targetDate: LocalDate.fromString('2025-02-01'),
          description: ProjectDescription.empty(),
          goalId: GoalId.from(goalId),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(10),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
      new ProjectCreated(
        {
          projectId: ProjectId.from(projectTwoId),
          name: ProjectName.from('Project Two'),
          status: ProjectStatus.InProgress,
          startDate: LocalDate.fromString('2025-01-01'),
          targetDate: LocalDate.fromString('2025-02-01'),
          description: ProjectDescription.empty(),
          goalId: GoalId.from(goalId),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(20),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    await eventBus.publish([
      new ProjectStatusTransitioned(
        {
          projectId: ProjectId.from(projectOneId),
          status: ProjectStatus.Completed,
          changedAt: Timestamp.fromMillis(1000),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    await eventBus.publish([
      new ProjectStatusTransitioned(
        {
          projectId: ProjectId.from(projectTwoId),
          status: ProjectStatus.Completed,
          changedAt: Timestamp.fromMillis(2000),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    expect(dispatched).toEqual([goalId]);
  });

  it('retries achievement when previously requested but goal is still unachieved', async () => {
    const goalId = '00000000-0000-0000-0000-000000000030';
    const store = new InMemoryGoalAchievementStore();
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      seedEvents([]),
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

    await eventBus.publish([
      new GoalCreated(
        {
          goalId: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete projects'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        },
        { eventId: EventId.create(), actorId: ActorId.from('user-1') }
      ),
    ]);

    const projectOne = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000031'),
        name: ProjectName.from('Project One'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(1000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectOne]);

    const goalState = await store.getGoalState(goalId);
    if (!goalState) {
      throw new Error('Expected goal state to be stored');
    }
    goalState.achievementRequested = true;
    await store.saveGoalState(goalState);

    const projectTwo = new ProjectCreated(
      {
        projectId: ProjectId.from('00000000-0000-0000-0000-000000000032'),
        name: ProjectName.from('Project Two'),
        status: ProjectStatus.Completed,
        startDate: LocalDate.fromString('2025-01-01'),
        targetDate: LocalDate.fromString('2025-02-01'),
        description: ProjectDescription.empty(),
        goalId: GoalId.from(goalId),
        createdBy: UserId.from('user-1'),
        createdAt: Timestamp.fromMillis(2000),
      },
      { eventId: EventId.create(), actorId: ActorId.from('user-1') }
    );
    await eventBus.publish([projectTwo]);

    expect(dispatched).toEqual([goalId, goalId]);
  });
});
