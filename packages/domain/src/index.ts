// Shared
export * from './shared/DomainEvent';
export * from './shared/Entity';
export * from './shared/AggregateRoot';
export * from './shared/eventSpec';
export * from './shared/vos/Timestamp';
export * from './shared/vos/LocalDate';
export * from './shared/vos/ValueObject';
export * from './shared/vos/ActorId';
export * from './shared/vos/EventId';
export * from './shared/vos/CorrelationId';

// Identity Value Objects
export * from './identity/UserId';
export * from './identity/events/UserRegistered';

// Goal Value Objects
export * from './goals/vos/GoalId';
export * from './goals/Slice';
export * from './goals/vos/Priority';
export * from './goals/vos/Month';
export * from './goals/vos/Summary';
export * from './goals/vos/Permission';

// Entities
export * from './goals/vos/AccessEntry';

// Aggregates
export * from './goals/Goal';
export * from './projects/Project';

// Events & utilities
export * from './events/eventTypes';
export * from './goals/events/GoalCreated';
export * from './goals/events/GoalRefined';
export * from './goals/events/GoalRecategorized';
export * from './goals/events/GoalRescheduled';
export * from './goals/events/GoalPrioritized';
export * from './goals/events/GoalAchieved';
export * from './goals/events/GoalArchived';
export * from './goals/events/GoalAccessGranted';
export * from './goals/events/GoalAccessRevoked';
export * from './projects/events/ProjectCreated';
export * from './projects/events/ProjectStatusTransitioned';
export * from './projects/events/ProjectRescheduled';
export * from './projects/events/ProjectRenamed';
export * from './projects/events/ProjectDescribed';
export * from './projects/events/ProjectGoalAdded';
export * from './projects/events/ProjectGoalRemoved';
export * from './projects/events/ProjectMilestoneAdded';
export * from './projects/events/ProjectMilestoneRescheduled';
export * from './projects/events/ProjectMilestoneRenamed';
export * from './projects/events/ProjectMilestoneArchived';
export * from './projects/events/ProjectArchived';
export * from './projects/vos/ProjectId';
export * from './projects/vos/ProjectName';
export * from './projects/vos/ProjectStatus';
export * from './projects/vos/ProjectDescription';
export * from './projects/vos/MilestoneId';
export * from './projects/vos/MilestoneName';
export * from './projects/Milestone';
export * from './utils/uuid';
