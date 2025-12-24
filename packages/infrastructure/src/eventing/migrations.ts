import { goalEventTypes, projectEventTypes } from '@mo/domain';

export type MigrationStep = (payload: unknown) => unknown;

export type MigrationPlan = Readonly<{
  latestVersion: number;
  steps: Readonly<Record<number, MigrationStep>>;
}>;

export const migrations: Readonly<Record<string, MigrationPlan>> = {
  [goalEventTypes.goalCreated]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalRefined]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalRecategorized]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalRescheduled]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalPrioritized]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalArchived]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalAccessGranted]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalAccessRevoked]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectCreated]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectStatusTransitioned]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectRescheduled]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectRenamed]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectDescribed]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectGoalAdded]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectGoalRemoved]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectMilestoneAdded]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectMilestoneRescheduled]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectMilestoneRenamed]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectMilestoneArchived]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectArchived]: { latestVersion: 1, steps: {} },
};

export function latestVersionOf(type: string): number {
  return migrations[type]?.latestVersion ?? 1;
}
