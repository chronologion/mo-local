import {
  ProjectCreated,
  ProjectStatusChanged,
  ProjectDateChanged,
  ProjectNameChanged,
  ProjectDescriptionChanged,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectMilestoneAdded,
  ProjectMilestoneTargetDateChanged,
  ProjectMilestoneNameChanged,
  ProjectMilestoneDeleted,
  ProjectArchived,
  ProjectStatusValue,
} from '@mo/domain';

export type SupportedProjectEvent =
  | ProjectCreated
  | ProjectStatusChanged
  | ProjectDateChanged
  | ProjectNameChanged
  | ProjectDescriptionChanged
  | ProjectGoalAdded
  | ProjectGoalRemoved
  | ProjectMilestoneAdded
  | ProjectMilestoneTargetDateChanged
  | ProjectMilestoneNameChanged
  | ProjectMilestoneDeleted
  | ProjectArchived;

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
  deletedAt: number | null;
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
  deletedAt: number | null;
};

export const applyProjectEventToSnapshot = (
  snapshot: ProjectSnapshotState | null,
  event: SupportedProjectEvent,
  version: number
): ProjectSnapshotState | null => {
  switch (event.eventType) {
    case 'ProjectCreated': {
      const payload = event.payload;
      return {
        id: payload.projectId,
        name: payload.name,
        status: payload.status,
        startDate: payload.startDate,
        targetDate: payload.targetDate,
        description: payload.description,
        goalId: payload.goalId,
        milestones: [],
        createdAt: payload.createdAt.getTime(),
        updatedAt: payload.createdAt.getTime(),
        deletedAt: null,
        version,
      };
    }
    case 'ProjectStatusChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        status: event.payload.status,
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectDateChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        startDate: event.payload.startDate,
        targetDate: event.payload.targetDate,
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectNameChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        name: event.payload.name,
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectDescriptionChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        description: event.payload.description,
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectGoalAdded': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: event.payload.goalId,
        updatedAt: event.payload.addedAt.getTime(),
        version,
      };
    }
    case 'ProjectGoalRemoved': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: null,
        updatedAt: event.payload.removedAt.getTime(),
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
            id: event.payload.milestoneId,
            name: event.payload.name,
            targetDate: event.payload.targetDate,
          },
        ],
        updatedAt: event.payload.addedAt.getTime(),
        version,
      };
    }
    case 'ProjectMilestoneTargetDateChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.payload.milestoneId
            ? { ...m, targetDate: event.payload.targetDate }
            : m
        ),
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectMilestoneNameChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.payload.milestoneId
            ? { ...m, name: event.payload.name }
            : m
        ),
        updatedAt: event.payload.changedAt.getTime(),
        version,
      };
    }
    case 'ProjectMilestoneDeleted': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.filter(
          (m) => m.id !== event.payload.milestoneId
        ),
        updatedAt: event.payload.deletedAt.getTime(),
        version,
      };
    }
    case 'ProjectArchived': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        deletedAt: event.payload.deletedAt.getTime(),
        updatedAt: event.payload.deletedAt.getTime(),
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
  deletedAt: snapshot.deletedAt,
});
