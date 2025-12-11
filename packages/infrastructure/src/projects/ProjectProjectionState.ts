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
  ProjectMilestoneArchived,
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
  | ProjectMilestoneArchived
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
        id: payload.projectId.value,
        name: payload.name.value,
        status: payload.status.value,
        startDate: payload.startDate.value,
        targetDate: payload.targetDate.value,
        description: payload.description.value,
        goalId: payload.goalId ? payload.goalId.value : null,
        milestones: [],
        createdAt: payload.createdAt.value,
        updatedAt: payload.createdAt.value,
        archivedAt: null,
        version,
      };
    }
    case 'ProjectStatusChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        status: event.payload.status.value,
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectDateChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        startDate: event.payload.startDate.value,
        targetDate: event.payload.targetDate.value,
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectNameChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        name: event.payload.name.value,
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectDescriptionChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        description: event.payload.description.value,
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectGoalAdded': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: event.payload.goalId.value,
        updatedAt: event.payload.addedAt.value,
        version,
      };
    }
    case 'ProjectGoalRemoved': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        goalId: null,
        updatedAt: event.payload.removedAt.value,
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
            id: event.payload.milestoneId.value,
            name: event.payload.name,
            targetDate: event.payload.targetDate.value,
          },
        ],
        updatedAt: event.payload.addedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneTargetDateChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.payload.milestoneId.value
            ? { ...m, targetDate: event.payload.targetDate.value }
            : m
        ),
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneNameChanged': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.map((m) =>
          m.id === event.payload.milestoneId.value
            ? { ...m, name: event.payload.name }
            : m
        ),
        updatedAt: event.payload.changedAt.value,
        version,
      };
    }
    case 'ProjectMilestoneArchived': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        milestones: snapshot.milestones.filter(
          (m) => m.id !== event.payload.milestoneId.value
        ),
        updatedAt: event.payload.archivedAt.value,
        version,
      };
    }
    case 'ProjectArchived': {
      if (!snapshot) return null;
      return {
        ...snapshot,
        archivedAt: event.payload.archivedAt.value,
        updatedAt: event.payload.archivedAt.value,
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
});
