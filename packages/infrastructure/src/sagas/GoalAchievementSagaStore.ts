import type { Store } from '@livestore/livestore';
import type {
  GoalAchievementCursor,
  GoalAchievementState,
  GoalAchievementStorePort,
  ProjectAchievementState,
} from '@mo/application';

type GoalStateRow = {
  goal_id: string;
  linked_project_ids: string;
  completed_project_ids: string;
  achieved: number;
  achievement_requested: number;
};

type ProjectStateRow = {
  project_id: string;
  goal_id: string | null;
  status: string | null;
};

const parseJsonList = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
};

const serializeList = (values: string[]): string => JSON.stringify(values);

export class GoalAchievementSagaStore implements GoalAchievementStorePort {
  constructor(private readonly store: Store) {}

  async getGoalState(goalId: string): Promise<GoalAchievementState | null> {
    const rows = this.store.query<GoalStateRow[]>({
      query: `
        SELECT goal_id, linked_project_ids, completed_project_ids, achieved, achievement_requested
        FROM goal_achievement_state
        WHERE goal_id = ?
      `,
      bindValues: [goalId],
    });
    const row = rows[0];
    if (!row) return null;
    return {
      goalId: row.goal_id,
      linkedProjectIds: parseJsonList(row.linked_project_ids),
      completedProjectIds: parseJsonList(row.completed_project_ids),
      achieved: row.achieved === 1,
      achievementRequested: row.achievement_requested === 1,
    };
  }

  async saveGoalState(
    state: GoalAchievementState,
    _cursor?: GoalAchievementCursor
  ): Promise<void> {
    this.store.query({
      query: `
        INSERT INTO goal_achievement_state (
          goal_id,
          linked_project_ids,
          completed_project_ids,
          achieved,
          achievement_requested
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(goal_id) DO UPDATE SET
          linked_project_ids = excluded.linked_project_ids,
          completed_project_ids = excluded.completed_project_ids,
          achieved = excluded.achieved,
          achievement_requested = excluded.achievement_requested
      `,
      bindValues: [
        state.goalId,
        serializeList(state.linkedProjectIds),
        serializeList(state.completedProjectIds),
        state.achieved ? 1 : 0,
        state.achievementRequested ? 1 : 0,
      ],
    });
  }

  async getProjectState(
    projectId: string
  ): Promise<ProjectAchievementState | null> {
    const rows = this.store.query<ProjectStateRow[]>({
      query: `
        SELECT project_id, goal_id, status
        FROM goal_achievement_projects
        WHERE project_id = ?
      `,
      bindValues: [projectId],
    });
    const row = rows[0];
    if (!row) return null;
    return {
      projectId: row.project_id,
      goalId: row.goal_id,
      status: row.status as ProjectAchievementState['status'],
    };
  }

  async saveProjectState(
    state: ProjectAchievementState,
    _cursor?: GoalAchievementCursor
  ): Promise<void> {
    this.store.query({
      query: `
        INSERT INTO goal_achievement_projects (project_id, goal_id, status)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          goal_id = excluded.goal_id,
          status = excluded.status
      `,
      bindValues: [state.projectId, state.goalId, state.status],
    });
  }

  async removeProjectState(projectId: string): Promise<void> {
    this.store.query({
      query: 'DELETE FROM goal_achievement_projects WHERE project_id = ?',
      bindValues: [projectId],
    });
  }
}
