export const goalEventTypes = {
  goalCreated: 'GoalCreated',
  goalSummaryChanged: 'GoalSummaryChanged',
  goalSliceChanged: 'GoalSliceChanged',
  goalTargetChanged: 'GoalTargetChanged',
  goalPriorityChanged: 'GoalPriorityChanged',
  goalArchived: 'GoalArchived',
  goalAccessGranted: 'GoalAccessGranted',
  goalAccessRevoked: 'GoalAccessRevoked',
} as const;

export type GoalEventType =
  (typeof goalEventTypes)[keyof typeof goalEventTypes];
