import { describe, expect, it } from 'vitest';
import {
  GoalAchievementSaga,
  type GoalAchievementState,
  type IGoalAchievementStore,
  type ProjectAchievementState,
} from '../../src/sagas';
import type { IGoalReadModel } from '../../src/goals/ports/IGoalReadModel';
import type { IProjectReadModel } from '../../src/projects/ports/IProjectReadModel';
import type { GoalListItemDto } from '../../src/goals/dtos';
import type { ProjectListItemDto } from '../../src/projects/dtos';

class InMemoryGoalAchievementStore implements IGoalAchievementStore {
  private readonly goals = new Map<string, GoalAchievementState>();
  private readonly projects = new Map<string, ProjectAchievementState>();

  async getGoalState(goalId: string): Promise<GoalAchievementState | null> {
    return this.goals.get(goalId) ?? null;
  }

  async saveGoalState(state: GoalAchievementState): Promise<void> {
    this.goals.set(state.goalId, { ...state });
  }

  async getProjectState(
    projectId: string
  ): Promise<ProjectAchievementState | null> {
    return this.projects.get(projectId) ?? null;
  }

  async saveProjectState(state: ProjectAchievementState): Promise<void> {
    this.projects.set(state.projectId, { ...state });
  }

  async removeProjectState(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }
}

class StubGoalReadModel implements IGoalReadModel {
  constructor(private readonly goals: GoalListItemDto[]) {}

  async list(): Promise<GoalListItemDto[]> {
    return this.goals;
  }

  async getById(id: string): Promise<GoalListItemDto | null> {
    return this.goals.find((goal) => goal.id === id) ?? null;
  }

  async search(): Promise<GoalListItemDto[]> {
    return [];
  }
}

class StubProjectReadModel implements IProjectReadModel {
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

describe('GoalAchievementSaga', () => {
  it('dispatches AchieveGoal when all linked projects are completed on bootstrap', async () => {
    const goalId = 'goal-1';
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
    const goals: GoalListItemDto[] = [
      {
        id: goalId,
        summary: 'Complete projects',
        slice: 'Work',
        priority: 'must',
        targetMonth: '2025-03',
        createdAt: 1,
        achievedAt: null,
        archivedAt: null,
        version: 5,
      },
    ];

    const store = new InMemoryGoalAchievementStore();
    const goalReadModel = new StubGoalReadModel(goals);
    const projectReadModel = new StubProjectReadModel(projects);
    const dispatched: string[] = [];

    const saga = new GoalAchievementSaga(
      store,
      goalReadModel,
      projectReadModel,
      async (command) => {
        dispatched.push(command.goalId);
      }
    );

    await saga.bootstrap();

    expect(dispatched).toEqual([goalId]);
    const state = await store.getGoalState(goalId);
    expect(state?.achievementRequested).toBe(true);
  });
});
