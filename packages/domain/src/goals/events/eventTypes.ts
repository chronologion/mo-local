export const goalEventTypes = {
  goalCreated: 'GoalCreated',
  goalRefined: 'GoalRefined',
  goalRecategorized: 'GoalRecategorized',
  goalRescheduled: 'GoalRescheduled',
  goalPrioritized: 'GoalPrioritized',
  goalArchived: 'GoalArchived',
  goalAccessGranted: 'GoalAccessGranted',
  goalAccessRevoked: 'GoalAccessRevoked',
} as const;

export type GoalEventType =
  (typeof goalEventTypes)[keyof typeof goalEventTypes];
