export type GoalRow = {
  id: string;
  slice: string;
  summary: string;
  target_month: string;
  priority: string;
  created_by: string;
  created_at: number;
  deleted_at: number | null;
  version: number;
};

export type GoalAccessRow = {
  id: string;
  goal_id: string;
  user_id: string;
  permission: string;
  granted_at: number;
  revoked_at: number | null;
};

export type MaterializedState = {
  goals: Map<string, GoalRow>;
  goalAccess: Map<string, GoalAccessRow>;
};

export const createEmptyState = (): MaterializedState => ({
  goals: new Map(),
  goalAccess: new Map(),
});
