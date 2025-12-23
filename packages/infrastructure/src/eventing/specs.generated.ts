import type { DomainEvent, PayloadEventSpec } from '@mo/domain';
import type { RuntimeEventSpec } from './types';
import {
  GoalAccessGrantedSpec,
  GoalAccessRevokedSpec,
  GoalArchivedSpec,
  GoalCreatedSpec,
  GoalPriorityChangedSpec,
  GoalSliceChangedSpec,
  GoalSummaryChangedSpec,
  GoalTargetChangedSpec,
  ProjectArchivedSpec,
  ProjectCreatedSpec,
  ProjectDateChangedSpec,
  ProjectDescriptionChangedSpec,
  ProjectGoalAddedSpec,
  ProjectGoalRemovedSpec,
  ProjectMilestoneAddedSpec,
  ProjectMilestoneArchivedSpec,
  ProjectMilestoneNameChangedSpec,
  ProjectMilestoneTargetDateChangedSpec,
  ProjectNameChangedSpec,
  ProjectStatusChangedSpec,
} from '@mo/domain';

const toRuntimeSpec = <E extends DomainEvent, P extends object>(
  spec: PayloadEventSpec<E, P>
): RuntimeEventSpec => spec as unknown as RuntimeEventSpec;

export const allSpecs = [
  toRuntimeSpec(GoalCreatedSpec),
  toRuntimeSpec(GoalSummaryChangedSpec),
  toRuntimeSpec(GoalSliceChangedSpec),
  toRuntimeSpec(GoalTargetChangedSpec),
  toRuntimeSpec(GoalPriorityChangedSpec),
  toRuntimeSpec(GoalArchivedSpec),
  toRuntimeSpec(GoalAccessGrantedSpec),
  toRuntimeSpec(GoalAccessRevokedSpec),
  toRuntimeSpec(ProjectCreatedSpec),
  toRuntimeSpec(ProjectStatusChangedSpec),
  toRuntimeSpec(ProjectDateChangedSpec),
  toRuntimeSpec(ProjectNameChangedSpec),
  toRuntimeSpec(ProjectDescriptionChangedSpec),
  toRuntimeSpec(ProjectGoalAddedSpec),
  toRuntimeSpec(ProjectGoalRemovedSpec),
  toRuntimeSpec(ProjectMilestoneAddedSpec),
  toRuntimeSpec(ProjectMilestoneTargetDateChangedSpec),
  toRuntimeSpec(ProjectMilestoneNameChangedSpec),
  toRuntimeSpec(ProjectMilestoneArchivedSpec),
  toRuntimeSpec(ProjectArchivedSpec),
] as const satisfies readonly RuntimeEventSpec[];
