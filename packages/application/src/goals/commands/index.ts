export * from './CreateGoal';
export * from './ChangeGoalSummary';
export * from './ChangeGoalSlice';
export * from './ChangeGoalTargetMonth';
export * from './ChangeGoalPriority';
export * from './ArchiveGoal';
export * from './GrantGoalAccess';
export * from './RevokeGoalAccess';

import type { CreateGoal } from './CreateGoal';
import type { ChangeGoalSummary } from './ChangeGoalSummary';
import type { ChangeGoalSlice } from './ChangeGoalSlice';
import type { ChangeGoalTargetMonth } from './ChangeGoalTargetMonth';
import type { ChangeGoalPriority } from './ChangeGoalPriority';
import type { ArchiveGoal } from './ArchiveGoal';
import type { GrantGoalAccess } from './GrantGoalAccess';
import type { RevokeGoalAccess } from './RevokeGoalAccess';

export type GoalCommand =
  | CreateGoal
  | ChangeGoalSummary
  | ChangeGoalSlice
  | ChangeGoalTargetMonth
  | ChangeGoalPriority
  | ArchiveGoal
  | GrantGoalAccess
  | RevokeGoalAccess;
