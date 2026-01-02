export const projectEventTypes = {
  projectCreated: 'ProjectCreated',
  projectStatusTransitioned: 'ProjectStatusTransitioned',
  projectRescheduled: 'ProjectRescheduled',
  projectRenamed: 'ProjectRenamed',
  projectDescribed: 'ProjectDescribed',
  projectGoalAdded: 'ProjectGoalAdded',
  projectGoalRemoved: 'ProjectGoalRemoved',
  projectMilestoneAdded: 'ProjectMilestoneAdded',
  projectMilestoneRescheduled: 'ProjectMilestoneRescheduled',
  projectMilestoneRenamed: 'ProjectMilestoneRenamed',
  projectMilestoneArchived: 'ProjectMilestoneArchived',
  projectArchived: 'ProjectArchived',
} as const;

export type ProjectEventType = (typeof projectEventTypes)[keyof typeof projectEventTypes];
