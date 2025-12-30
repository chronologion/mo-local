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

export type GoalAchievementCursor = {
  globalSequence: number;
  pendingCommitSequence: number;
};

export interface GoalAchievementStorePort {
  getGoalState(goalId: string): Promise<GoalAchievementState | null>;
  saveGoalState(
    state: GoalAchievementState,
    cursor?: GoalAchievementCursor
  ): Promise<void>;
  getProjectState(projectId: string): Promise<ProjectAchievementState | null>;
  saveProjectState(
    state: ProjectAchievementState,
    cursor?: GoalAchievementCursor
  ): Promise<void>;
  removeProjectState(projectId: string): Promise<void>;
  resetAll(): Promise<void>;
}
