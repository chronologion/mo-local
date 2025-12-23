import { goalEventTypes, projectEventTypes } from '@mo/domain';

export type MigrationStep = (payload: unknown) => unknown;

export type MigrationPlan = Readonly<{
  latestVersion: number;
  steps: Readonly<Record<number, MigrationStep>>;
}>;

export const migrations: Readonly<Record<string, MigrationPlan>> = {
  [goalEventTypes.goalCreated]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalSummaryChanged]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalSliceChanged]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalTargetChanged]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalPriorityChanged]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalArchived]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalAccessGranted]: { latestVersion: 1, steps: {} },
  [goalEventTypes.goalAccessRevoked]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectCreated]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectStatusChanged]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectDateChanged]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectNameChanged]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectDescriptionChanged]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectGoalAdded]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectGoalRemoved]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectMilestoneAdded]: { latestVersion: 1, steps: {} },
  [projectEventTypes.projectMilestoneTargetDateChanged]: {
    latestVersion: 1,
    steps: {},
  },
  [projectEventTypes.projectMilestoneNameChanged]: {
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
