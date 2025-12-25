import type { ProjectStatusValue } from '@mo/domain';

export type GoalAchievementState = {
  goalId: string;
  linkedProjectIds: string[];
  completedProjectIds: string[];
  achieved: boolean;
  achievementRequested: boolean;
};

export type ProjectAchievementState = {
  projectId: string;
  goalId: string | null;
  status: ProjectStatusValue | null;
};

export interface IGoalAchievementStore {
  getGoalState(goalId: string): Promise<GoalAchievementState | null>;
  saveGoalState(state: GoalAchievementState): Promise<void>;
  getProjectState(projectId: string): Promise<ProjectAchievementState | null>;
  saveProjectState(state: ProjectAchievementState): Promise<void>;
  removeProjectState(projectId: string): Promise<void>;
}
