import type { PriorityLevel, SliceValue } from '@mo/domain';
import type { ProjectStatusValue } from '@mo/domain';

export type GoalListItemDto = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdAt: number;
  deletedAt: number | null;
};

export type ProjectListItemDto = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  milestones: { id: string; name: string; targetDate: string }[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

// Interfaces the application layer depends on; implemented in infrastructure.
export interface IGoalQueries {
  listGoals(filter?: {
    slice?: string;
    month?: string;
    priority?: string;
  }): Promise<GoalListItemDto[]>;
  getGoalById(goalId: string): Promise<GoalListItemDto | null>;
  searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): Promise<GoalListItemDto[]>;
}

export interface IProjectQueries {
  listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): Promise<ProjectListItemDto[]>;
  getProjectById(projectId: string): Promise<ProjectListItemDto | null>;
  searchProjects(term: string): Promise<ProjectListItemDto[]>;
}
