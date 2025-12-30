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
import type { GoalRepositoryPort } from '../../src/goals/ports/GoalRepositoryPort';
import type { ProjectReadModelPort } from '../../src/projects/ports/ProjectReadModelPort';
import type { ProjectListItemDto } from '../../src/projects/dtos';
import { UnachieveGoal } from '../../src/goals/commands/UnachieveGoal';
import {
  ActorId,
  DomainEvent,
  EventId,
  GoalId,
  Goal,
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
import { none, some, type Option } from '../../src/shared/ports/Option';

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

class StubGoalRepository implements GoalRepositoryPort {
  constructor(private readonly goals: Map<string, Goal>) {}

  async load(id: GoalId): Promise<Option<Goal>> {
    const goal = this.goals.get(id.value);
    return goal ? some(goal) : none();
  }

  async save(_: Goal, __: Uint8Array): Promise<void> {
    return;
  }

  async archive(_: GoalId, __: Timestamp, ___: UserId): Promise<void> {
    return;
  }
}

class StubProjectReadModel implements ProjectReadModelPort {
  constructor(private readonly projects: ProjectListItemDto[]) {}

  async list(): Promise<ProjectListItemDto[]> {
    return this.projects;
  }

  async getById(id: string): Promise<ProjectListItemDto | null> {
    return this.projects.find((project) => project.id === id) ?? null;
  }

  async search(): Promise<ProjectListItemDto[]> {
    return [];
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

const dispatchNoop = async () => undefined;

describe('GoalAchievementSaga', () => {
  it('dispatches AchieveGoal when all linked projects are completed on bootstrap', async () => {
    const goalId = '00000000-0000-0000-0000-000000000001';
    const projects: ProjectListItemDto[] = [
      {
        id: 'project-1',
        name: 'Project One',
        status: 'completed',
        startDate: '2025-01-01',
        targetDate: '2025-02-01',
        description: '',
        goalId,
        milestones: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 2,
      },
      {
        id: 'project-2',
        name: 'Project Two',
        status: 'completed',
        startDate: '2025-01-01',
        targetDate: '2025-02-01',
        description: '',
        goalId,
        milestones: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 2,
      },
    ];
    const goals = new Map([
      [
        goalId,
        Goal.create({
          id: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete projects'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        }),
      ],
    ]);

    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projectReadModel = new StubProjectReadModel(projects);
    const dispatched: string[] = [];

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
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
    const goal = Goal.create({
      id: GoalId.from(goalId),
      slice: Slice.from('Work'),
      summary: Summary.from('Complete projects'),
      targetMonth: Month.from('2025-03'),
      priority: Priority.from('must'),
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1),
    });
    goal.achieve({
      achievedAt: Timestamp.fromMillis(10),
      actorId: UserId.from('user-1'),
    });
    const goals = new Map([[goalId, goal]]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projects: ProjectListItemDto[] = [
      {
        id: 'project-1',
        name: 'Project One',
        status: 'in_progress',
        startDate: '2025-01-01',
        targetDate: '2025-02-01',
        description: '',
        goalId,
        milestones: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 1,
      },
    ];
    const projectReadModel = new StubProjectReadModel(projects);
    const dispatchedUnachieve: UnachieveGoal[] = [];

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
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
    const goals = new Map([
      [
        goalId,
        Goal.create({
          id: GoalId.from(goalId),
          slice: Slice.from('Work'),
          summary: Summary.from('Complete project'),
          targetMonth: Month.from('2025-03'),
          priority: Priority.from('must'),
          createdBy: UserId.from('user-1'),
          createdAt: Timestamp.fromMillis(1),
        }),
      ],
    ]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projectReadModel = new StubProjectReadModel([]);
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

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
    const goal = Goal.create({
      id: GoalId.from(goalId),
      slice: Slice.from('Work'),
      summary: Summary.from('Complete projects'),
      targetMonth: Month.from('2025-03'),
      priority: Priority.from('must'),
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1),
    });
    const goals = new Map([[goalId, goal]]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projectReadModel = new StubProjectReadModel([]);
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
        const goal = goals.get(command.goalId);
        if (goal) {
          goal.achieve({
            achievedAt: Timestamp.fromMillis(command.timestamp),
            actorId: UserId.from(command.userId),
          });
        }
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

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
    goal.unachieve({ unachievedAt, actorId: UserId.from('user-1') });

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
    const goal = Goal.create({
      id: GoalId.from(goalId),
      slice: Slice.from('Work'),
      summary: Summary.from('Complete projects'),
      targetMonth: Month.from('2025-03'),
      priority: Priority.from('must'),
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1),
    });
    const goals = new Map([[goalId, goal]]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projectReadModel = new StubProjectReadModel([]);
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
        const goal = goals.get(command.goalId);
        if (goal) {
          goal.achieve({
            achievedAt: Timestamp.fromMillis(command.timestamp),
            actorId: UserId.from(command.userId),
          });
        }
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

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
    goal.unachieve({ unachievedAt, actorId: UserId.from('user-1') });

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

  it('derives goal linkage from read model on status transition', async () => {
    const goalId = '00000000-0000-0000-0000-000000000040';
    const projectOneId = '00000000-0000-0000-0000-000000000041';
    const projectTwoId = '00000000-0000-0000-0000-000000000042';
    const goal = Goal.create({
      id: GoalId.from(goalId),
      slice: Slice.from('Work'),
      summary: Summary.from('Complete projects'),
      targetMonth: Month.from('2025-03'),
      priority: Priority.from('must'),
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1),
    });
    const goals = new Map([[goalId, goal]]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projects: ProjectListItemDto[] = [
      {
        id: projectOneId,
        name: 'Project One',
        status: 'in_progress',
        startDate: '2025-01-01',
        targetDate: '2025-02-01',
        description: '',
        goalId,
        milestones: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 2,
      },
      {
        id: projectTwoId,
        name: 'Project Two',
        status: 'in_progress',
        startDate: '2025-01-01',
        targetDate: '2025-02-01',
        description: '',
        goalId,
        milestones: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        version: 2,
      },
    ];
    const projectReadModel = new StubProjectReadModel(projects);
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

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
    const goal = Goal.create({
      id: GoalId.from(goalId),
      slice: Slice.from('Work'),
      summary: Summary.from('Complete projects'),
      targetMonth: Month.from('2025-03'),
      priority: Priority.from('must'),
      createdBy: UserId.from('user-1'),
      createdAt: Timestamp.fromMillis(1),
    });
    const goals = new Map([[goalId, goal]]);
    const store = new InMemoryGoalAchievementStore();
    const goalRepo = new StubGoalRepository(goals);
    const projectReadModel = new StubProjectReadModel([]);
    const dispatched: string[] = [];
    const eventBus = new InMemoryEventBus();

    const saga = new GoalAchievementSaga(
      store,
      goalRepo,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
      },
      dispatchNoop
    );
    saga.subscribe(eventBus);

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
