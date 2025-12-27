export const goalEventTypes = {
  goalCreated: 'GoalCreated',
  goalRefined: 'GoalRefined',
  goalRecategorized: 'GoalRecategorized',
  goalRescheduled: 'GoalRescheduled',
  goalPrioritized: 'GoalPrioritized',
  goalAchieved: 'GoalAchieved',
  goalUnachieved: 'GoalUnachieved',
  goalArchived: 'GoalArchived',
  goalAccessGranted: 'GoalAccessGranted',
  goalAccessRevoked: 'GoalAccessRevoked',
} as const;

export type GoalEventType =
  (typeof goalEventTypes)[keyof typeof goalEventTypes];
