export * from './CreateProject';
export * from './ChangeProjectStatus';
export * from './ChangeProjectDates';
export * from './ChangeProjectName';
export * from './ChangeProjectDescription';
export * from './AddProjectGoal';
export * from './RemoveProjectGoal';
export * from './AddProjectMilestone';
export * from './ChangeProjectMilestoneTargetDate';
export * from './ChangeProjectMilestoneName';
export * from './ArchiveProjectMilestone';
export * from './ArchiveProject';

import type { CreateProject } from './CreateProject';
import type { ChangeProjectStatus } from './ChangeProjectStatus';
import type { ChangeProjectDates } from './ChangeProjectDates';
import type { ChangeProjectName } from './ChangeProjectName';
import type { ChangeProjectDescription } from './ChangeProjectDescription';
import type { AddProjectGoal } from './AddProjectGoal';
import type { RemoveProjectGoal } from './RemoveProjectGoal';
import type { AddProjectMilestone } from './AddProjectMilestone';
import type { ChangeProjectMilestoneTargetDate } from './ChangeProjectMilestoneTargetDate';
import type { ChangeProjectMilestoneName } from './ChangeProjectMilestoneName';
import type { ArchiveProjectMilestone } from './ArchiveProjectMilestone';
import type { ArchiveProject } from './ArchiveProject';

export type ProjectCommand =
  | CreateProject
  | ChangeProjectStatus
  | ChangeProjectDates
  | ChangeProjectName
  | ChangeProjectDescription
  | AddProjectGoal
  | RemoveProjectGoal
  | AddProjectMilestone
  | ChangeProjectMilestoneTargetDate
  | ChangeProjectMilestoneName
  | ArchiveProjectMilestone
  | ArchiveProject;
