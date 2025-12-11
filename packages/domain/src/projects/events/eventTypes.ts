export const projectEventTypes = {
  projectCreated: 'ProjectCreated',
  projectStatusChanged: 'ProjectStatusChanged',
  projectDateChanged: 'ProjectDateChanged',
  projectNameChanged: 'ProjectNameChanged',
  projectDescriptionChanged: 'ProjectDescriptionChanged',
  projectGoalAdded: 'ProjectGoalAdded',
  projectGoalRemoved: 'ProjectGoalRemoved',
  projectMilestoneAdded: 'ProjectMilestoneAdded',
  projectMilestoneTargetDateChanged: 'ProjectMilestoneTargetDateChanged',
  projectMilestoneNameChanged: 'ProjectMilestoneNameChanged',
  projectMilestoneArchived: 'ProjectMilestoneArchived',
  projectArchived: 'ProjectArchived',
} as const;

export type ProjectEventType =
  (typeof projectEventTypes)[keyof typeof projectEventTypes];
