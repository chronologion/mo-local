import type { AggregateId, DomainEvent, PayloadEventSpec } from '@mo/domain';
import type { RuntimeEventSpec } from './types';
import {
  GoalAccessGrantedSpec,
  GoalAccessRevokedSpec,
  GoalAchievedSpec,
  GoalUnachievedSpec,
  GoalArchivedSpec,
  GoalCreatedSpec,
  GoalPrioritizedSpec,
  GoalRecategorizedSpec,
  GoalRefinedSpec,
  GoalRescheduledSpec,
  ProjectArchivedSpec,
  ProjectCreatedSpec,
  ProjectRescheduledSpec,
  ProjectDescribedSpec,
  ProjectGoalAddedSpec,
  ProjectGoalRemovedSpec,
  ProjectMilestoneAddedSpec,
  ProjectMilestoneArchivedSpec,
  ProjectMilestoneRenamedSpec,
  ProjectMilestoneRescheduledSpec,
  ProjectRenamedSpec,
  ProjectStatusTransitionedSpec,
} from '@mo/domain';

const toRuntimeSpec = <E extends DomainEvent, P extends object, TId extends AggregateId>(
  spec: PayloadEventSpec<E, P, TId>
): RuntimeEventSpec =>
  // eslint-disable-next-line no-restricted-syntax -- Generated registry erases per-event field typing into the runtime spec union.
  spec as unknown as RuntimeEventSpec;

export const allSpecs = [
  toRuntimeSpec(GoalCreatedSpec),
  toRuntimeSpec(GoalRefinedSpec),
  toRuntimeSpec(GoalRecategorizedSpec),
  toRuntimeSpec(GoalRescheduledSpec),
  toRuntimeSpec(GoalPrioritizedSpec),
  toRuntimeSpec(GoalAchievedSpec),
  toRuntimeSpec(GoalUnachievedSpec),
  toRuntimeSpec(GoalArchivedSpec),
  toRuntimeSpec(GoalAccessGrantedSpec),
  toRuntimeSpec(GoalAccessRevokedSpec),
  toRuntimeSpec(ProjectCreatedSpec),
  toRuntimeSpec(ProjectStatusTransitionedSpec),
  toRuntimeSpec(ProjectRescheduledSpec),
  toRuntimeSpec(ProjectRenamedSpec),
  toRuntimeSpec(ProjectDescribedSpec),
  toRuntimeSpec(ProjectGoalAddedSpec),
  toRuntimeSpec(ProjectGoalRemovedSpec),
  toRuntimeSpec(ProjectMilestoneAddedSpec),
  toRuntimeSpec(ProjectMilestoneRescheduledSpec),
  toRuntimeSpec(ProjectMilestoneRenamedSpec),
  toRuntimeSpec(ProjectMilestoneArchivedSpec),
  toRuntimeSpec(ProjectArchivedSpec),
] as const satisfies readonly RuntimeEventSpec[];
