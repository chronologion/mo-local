// Shared
export * from './shared/DomainEvent';
export * from './shared/Entity';
export * from './shared/AggregateRoot';
export * from './shared/Timestamp';
export * from './shared/LocalDate';

// Identity Value Objects
export * from './identity/UserId';

// Goal Value Objects
export * from './goals/GoalId';
export * from './goals/Slice';
export * from './goals/Priority';
export * from './goals/Month';
export * from './goals/Summary';

// Entities
export * from './goals/AccessEntry';

// Aggregates
export * from './goals/Goal';
export * from './projects/Project';

// Events & utilities
export * from './events/eventTypes';
export * from './goals/events/GoalCreated';
export * from './goals/events/GoalSummaryChanged';
export * from './goals/events/GoalSliceChanged';
export * from './goals/events/GoalTargetChanged';
export * from './goals/events/GoalPriorityChanged';
export * from './goals/events/GoalArchived';
export * from './goals/events/GoalAccessGranted';
export * from './goals/events/GoalAccessRevoked';
export * from './projects/events/ProjectCreated';
export * from './projects/events/ProjectStatusChanged';
export * from './projects/events/ProjectDateChanged';
export * from './projects/events/ProjectNameChanged';
export * from './projects/events/ProjectDescriptionChanged';
export * from './projects/events/ProjectGoalAdded';
export * from './projects/events/ProjectGoalRemoved';
export * from './projects/events/ProjectMilestoneAdded';
export * from './projects/events/ProjectMilestoneTargetDateChanged';
export * from './projects/events/ProjectMilestoneNameChanged';
export * from './projects/events/ProjectMilestoneDeleted';
export * from './projects/events/ProjectArchived';
export * from './projects/ProjectId';
export * from './projects/ProjectName';
export * from './projects/ProjectStatus';
export * from './projects/ProjectDescription';
export * from './projects/MilestoneId';
export * from './projects/Milestone';
export * from './utils/uuid';
