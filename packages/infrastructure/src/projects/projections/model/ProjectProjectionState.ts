import {
  ProjectCreated,
  ProjectStatusTransitioned,
  ProjectRescheduled,
  ProjectRenamed,
  ProjectDescribed,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectMilestoneAdded,
  ProjectMilestoneRescheduled,
  ProjectMilestoneRenamed,
  ProjectMilestoneArchived,
  ProjectArchived,
  ProjectStatusValue,
  projectEventTypes,
  DomainEvent,
} from '@mo/domain';

export type SupportedProjectEvent =
  | ProjectCreated
  | ProjectStatusTransitioned
  | ProjectRescheduled
  | ProjectRenamed
  | ProjectDescribed
  | ProjectGoalAdded
  | ProjectGoalRemoved
  | ProjectMilestoneAdded
  | ProjectMilestoneRescheduled
  | ProjectMilestoneRenamed
  | ProjectMilestoneArchived
  | ProjectArchived;

const projectEventNames = new Set(Object.values(projectEventTypes) as string[]);

export const isProjectEvent = (
  event: DomainEvent
): event is SupportedProjectEvent => projectEventNames.has(event.eventType);

export type ProjectMilestoneState = {
  id: string;
  name: string;
  targetDate: string;
};

export type ProjectSnapshotState = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  milestones: ProjectMilestoneState[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  version: number;
};

export type ProjectListItem = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  milestones: ProjectMilestoneState[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  version: number;
};

export const applyProjectEventToSnapshot = (
  snapshot: ProjectSnapshotState | null,
  event: SupportedProjectEvent,
  version: number
): ProjectSnapshotState | null => {
  switch (event.eventType) {
    case 'ProjectCreated': {
      return {
        id: event.projectId.value,
        name: event.name.value,
        status: event.status.value,
        startDate: event.startDate.value,
        targetDate: event.targetDate.value,
        description: event.description.value,
        goalId: event.goalId ? event.goalId.value : null,
        milestones: [],
        createdAt: event.createdAt.value,
        updatedAt: event.createdAt.value,
        archivedAt: null,
        version,
      };
    }
    case 'ProjectStatusTransitioned': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        status: event.status.value,
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectRescheduled': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        startDate: event.startDate.value,
        targetDate: event.targetDate.value,
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectRenamed': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        name: event.name.value,
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectDescribed': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        description: event.description.value,
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectGoalAdded': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: event.goalId.value,
        updatedAt: event.addedAt.value,
        version,
      };
    }
    case 'ProjectGoalRemoved': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: null,
        updatedAt: event.removedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneAdded': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: [
          ...snapshot.milestones,
          {
            id: event.milestoneId.value,
            name: event.name,
            targetDate: event.targetDate.value,
          },
        ],
        updatedAt: event.addedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneRescheduled': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.milestoneId.value
            ? { ...m, targetDate: event.targetDate.value }
            : m
        ),
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneRenamed': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.milestoneId.value ? { ...m, name: event.name } : m
        ),
        updatedAt: event.changedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneArchived': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.filter(
          (m) => m.id !== event.milestoneId.value
        ),
        updatedAt: event.archivedAt.value,
        version,
      };
    }
    case 'ProjectArchived': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        archivedAt: event.archivedAt.value,
        updatedAt: event.archivedAt.value,
        version,
      };
    }
    default:
      return snapshot;
  }
};

export const projectSnapshotToListItem = (
  snapshot: ProjectSnapshotState
): ProjectListItem => ({
  id: snapshot.id,
  name: snapshot.name,
  status: snapshot.status,
  startDate: snapshot.startDate,
  targetDate: snapshot.targetDate,
  description: snapshot.description,
  goalId: snapshot.goalId,
  milestones: snapshot.milestones,
  createdAt: snapshot.createdAt,
  updatedAt: snapshot.updatedAt,
  archivedAt: snapshot.archivedAt,
  version: snapshot.version,
});
