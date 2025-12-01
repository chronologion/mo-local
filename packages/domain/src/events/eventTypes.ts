export const eventTypes = {
  goalCreated: 'GoalCreated',
  goalSummaryChanged: 'GoalSummaryChanged',
  goalSliceChanged: 'GoalSliceChanged',
  goalTargetChanged: 'GoalTargetChanged',
  goalPriorityChanged: 'GoalPriorityChanged',
  goalDeleted: 'GoalDeleted',
  goalAccessGranted: 'GoalAccessGranted',
  goalAccessRevoked: 'GoalAccessRevoked',
} as const;

export type GoalEventType = (typeof eventTypes)[keyof typeof eventTypes];
