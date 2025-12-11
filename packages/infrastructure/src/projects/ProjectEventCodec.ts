import {
  ProjectArchived,
  ProjectCreated,
  ProjectDateChanged,
  ProjectDescriptionChanged,
  ProjectEventType,
  projectEventTypes,
  ProjectGoalAdded,
  ProjectGoalRemoved,
  ProjectMilestoneAdded,
  ProjectMilestoneArchived,
  ProjectMilestoneNameChanged,
  ProjectMilestoneTargetDateChanged,
  ProjectNameChanged,
  ProjectStatusChanged,
  ProjectDescription,
  ProjectId,
  ProjectName,
  ProjectStatus,
  LocalDate,
  GoalId,
  UserId,
  Timestamp,
  MilestoneId,
} from '@mo/domain';
import { z } from 'zod';

const createdV1 = z.object({
  projectId: z.string(),
  name: z.string(),
  status: z.enum(['planned', 'in_progress', 'completed', 'canceled']),
  startDate: z.string(),
  targetDate: z.string(),
  description: z.string(),
  goalId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.number(),
});

const statusChangedV1 = z.object({
  projectId: z.string(),
  status: z.enum(['planned', 'in_progress', 'completed', 'canceled']),
  changedAt: z.number(),
});

const dateChangedV1 = z.object({
  projectId: z.string(),
  startDate: z.string(),
  targetDate: z.string(),
  changedAt: z.number(),
});

const nameChangedV1 = z.object({
  projectId: z.string(),
  name: z.string(),
  changedAt: z.number(),
});

const descriptionChangedV1 = z.object({
  projectId: z.string(),
  description: z.string(),
  changedAt: z.number(),
});

const goalAddedV1 = z.object({
  projectId: z.string(),
  goalId: z.string(),
  addedAt: z.number(),
});

const goalRemovedV1 = z.object({
  projectId: z.string(),
  removedAt: z.number(),
});

const milestoneAddedV1 = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  name: z.string(),
  targetDate: z.string(),
  addedAt: z.number(),
});

const milestoneTargetChangedV1 = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  targetDate: z.string(),
  changedAt: z.number(),
});

const milestoneNameChangedV1 = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  name: z.string(),
  changedAt: z.number(),
});

const milestoneArchivedV1 = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  archivedAt: z.number(),
});

const projectArchivedV1 = z.object({
  projectId: z.string(),
  archivedAt: z.number(),
});

type ProjectSchemas = {
  [projectEventTypes.projectCreated]: typeof createdV1;
  [projectEventTypes.projectStatusChanged]: typeof statusChangedV1;
  [projectEventTypes.projectDateChanged]: typeof dateChangedV1;
  [projectEventTypes.projectNameChanged]: typeof nameChangedV1;
  [projectEventTypes.projectDescriptionChanged]: typeof descriptionChangedV1;
  [projectEventTypes.projectGoalAdded]: typeof goalAddedV1;
  [projectEventTypes.projectGoalRemoved]: typeof goalRemovedV1;
  [projectEventTypes.projectMilestoneAdded]: typeof milestoneAddedV1;
  [projectEventTypes.projectMilestoneTargetDateChanged]: typeof milestoneTargetChangedV1;
  [projectEventTypes.projectMilestoneNameChanged]: typeof milestoneNameChangedV1;
  [projectEventTypes.projectMilestoneArchived]: typeof milestoneArchivedV1;
  [projectEventTypes.projectArchived]: typeof projectArchivedV1;
};

const schemas: ProjectSchemas = {
  [projectEventTypes.projectCreated]: createdV1,
  [projectEventTypes.projectStatusChanged]: statusChangedV1,
  [projectEventTypes.projectDateChanged]: dateChangedV1,
  [projectEventTypes.projectNameChanged]: nameChangedV1,
  [projectEventTypes.projectDescriptionChanged]: descriptionChangedV1,
  [projectEventTypes.projectGoalAdded]: goalAddedV1,
  [projectEventTypes.projectGoalRemoved]: goalRemovedV1,
  [projectEventTypes.projectMilestoneAdded]: milestoneAddedV1,
  [projectEventTypes.projectMilestoneTargetDateChanged]:
    milestoneTargetChangedV1,
  [projectEventTypes.projectMilestoneNameChanged]: milestoneNameChangedV1,
  [projectEventTypes.projectMilestoneArchived]: milestoneArchivedV1,
  [projectEventTypes.projectArchived]: projectArchivedV1,
};

export type SerializedProjectEvent = {
  aggregateId: string;
  eventType: ProjectEventType;
  payloadVersion: number;
  occurredAt: number;
  streamVersion: number;
  payload: unknown;
};

type ProjectDomainEvent =
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

type ProjectSchemaMap = typeof schemas;
type ProjectPayload<T extends ProjectEventType> = z.infer<ProjectSchemaMap[T]>;

const serializePayload = (
  event: ProjectDomainEvent
): { payload: unknown; occurredAt: number } => {
  switch (event.eventType) {
    case projectEventTypes.projectCreated:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          name: event.payload.name.value,
          status: event.payload.status.value,
          startDate: event.payload.startDate.value,
          targetDate: event.payload.targetDate.value,
          description: event.payload.description.value,
          goalId: event.payload.goalId ? event.payload.goalId.value : null,
          createdBy: event.payload.createdBy.value,
          createdAt: event.payload.createdAt.value,
        },
        occurredAt: event.payload.createdAt.value,
      };
    case projectEventTypes.projectStatusChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          status: event.payload.status.value,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectDateChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          startDate: event.payload.startDate.value,
          targetDate: event.payload.targetDate.value,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectNameChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          name: event.payload.name.value,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectDescriptionChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          description: event.payload.description.value,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectGoalAdded:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          goalId: event.payload.goalId.value,
          addedAt: event.payload.addedAt.value,
        },
        occurredAt: event.payload.addedAt.value,
      };
    case projectEventTypes.projectGoalRemoved:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          removedAt: event.payload.removedAt.value,
        },
        occurredAt: event.payload.removedAt.value,
      };
    case projectEventTypes.projectMilestoneAdded:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          milestoneId: event.payload.milestoneId.value,
          name: event.payload.name,
          targetDate: event.payload.targetDate.value,
          addedAt: event.payload.addedAt.value,
        },
        occurredAt: event.payload.addedAt.value,
      };
    case projectEventTypes.projectMilestoneTargetDateChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          milestoneId: event.payload.milestoneId.value,
          targetDate: event.payload.targetDate.value,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectMilestoneNameChanged:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          milestoneId: event.payload.milestoneId.value,
          name: event.payload.name,
          changedAt: event.payload.changedAt.value,
        },
        occurredAt: event.payload.changedAt.value,
      };
    case projectEventTypes.projectMilestoneArchived:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          milestoneId: event.payload.milestoneId.value,
          archivedAt: event.payload.archivedAt.value,
        },
        occurredAt: event.payload.archivedAt.value,
      };
    case projectEventTypes.projectArchived:
      return {
        payload: {
          projectId: event.payload.projectId.value,
          archivedAt: event.payload.archivedAt.value,
        },
        occurredAt: event.payload.archivedAt.value,
      };
    default: {
      const _exhaustiveCheck: never = event;
      throw new Error('Unsupported project event type');
    }
  }
};

export const ProjectEventCodec = {
  serialize(
    event: ProjectDomainEvent,
    streamVersion: number
  ): SerializedProjectEvent {
    const { payload, occurredAt } = serializePayload(event);
    return {
      aggregateId: event.aggregateId.value,
      eventType: event.eventType,
      payloadVersion: 1,
      occurredAt,
      streamVersion,
      payload,
    };
  },

  deserialize(
    eventType: ProjectEventType,
    payloadVersion: number,
    rawPayload: unknown
  ): ProjectDomainEvent {
    if (payloadVersion !== 1) {
      throw new Error(
        `Unsupported payloadVersion ${payloadVersion} for ${eventType}`
      );
    }
    const schema = schemas[eventType];
    const parsed = schema.safeParse(rawPayload);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join('; ');
      throw new Error(`Invalid payload for ${eventType}: ${issues}`);
    }
    const handler = toDomain[eventType] as (
      payload: unknown
    ) => ProjectDomainEvent;
    return handler(parsed.data);
  },
};

const toDomain: {
  [K in ProjectEventType]: (payload: ProjectPayload<K>) => ProjectDomainEvent;
} = {
  [projectEventTypes.projectCreated]: (payload) =>
    new ProjectCreated({
      projectId: ProjectId.from(payload.projectId),
      name: ProjectName.from(payload.name),
      status: ProjectStatus.from(payload.status),
      startDate: LocalDate.fromString(payload.startDate),
      targetDate: LocalDate.fromString(payload.targetDate),
      description: ProjectDescription.from(payload.description),
      goalId: payload.goalId ? GoalId.from(payload.goalId) : null,
      createdBy: UserId.from(payload.createdBy),
      createdAt: Timestamp.fromMillis(payload.createdAt),
    }),
  [projectEventTypes.projectStatusChanged]: (payload) =>
    new ProjectStatusChanged({
      projectId: ProjectId.from(payload.projectId),
      status: ProjectStatus.from(payload.status),
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectDateChanged]: (payload) =>
    new ProjectDateChanged({
      projectId: ProjectId.from(payload.projectId),
      startDate: LocalDate.fromString(payload.startDate),
      targetDate: LocalDate.fromString(payload.targetDate),
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectNameChanged]: (payload) =>
    new ProjectNameChanged({
      projectId: ProjectId.from(payload.projectId),
      name: ProjectName.from(payload.name),
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectDescriptionChanged]: (payload) =>
    new ProjectDescriptionChanged({
      projectId: ProjectId.from(payload.projectId),
      description: ProjectDescription.from(payload.description),
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectGoalAdded]: (payload) =>
    new ProjectGoalAdded({
      projectId: ProjectId.from(payload.projectId),
      goalId: GoalId.from(payload.goalId),
      addedAt: Timestamp.fromMillis(payload.addedAt),
    }),
  [projectEventTypes.projectGoalRemoved]: (payload) =>
    new ProjectGoalRemoved({
      projectId: ProjectId.from(payload.projectId),
      removedAt: Timestamp.fromMillis(payload.removedAt),
    }),
  [projectEventTypes.projectMilestoneAdded]: (payload) =>
    new ProjectMilestoneAdded({
      projectId: ProjectId.from(payload.projectId),
      milestoneId: MilestoneId.from(payload.milestoneId),
      name: payload.name,
      targetDate: LocalDate.fromString(payload.targetDate),
      addedAt: Timestamp.fromMillis(payload.addedAt),
    }),
  [projectEventTypes.projectMilestoneTargetDateChanged]: (payload) =>
    new ProjectMilestoneTargetDateChanged({
      projectId: ProjectId.from(payload.projectId),
      milestoneId: MilestoneId.from(payload.milestoneId),
      targetDate: LocalDate.fromString(payload.targetDate),
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectMilestoneNameChanged]: (payload) =>
    new ProjectMilestoneNameChanged({
      projectId: ProjectId.from(payload.projectId),
      milestoneId: MilestoneId.from(payload.milestoneId),
      name: payload.name,
      changedAt: Timestamp.fromMillis(payload.changedAt),
    }),
  [projectEventTypes.projectMilestoneArchived]: (payload) =>
    new ProjectMilestoneArchived({
      projectId: ProjectId.from(payload.projectId),
      milestoneId: MilestoneId.from(payload.milestoneId),
      archivedAt: Timestamp.fromMillis(payload.archivedAt),
    }),
  [projectEventTypes.projectArchived]: (payload) =>
    new ProjectArchived({
      projectId: ProjectId.from(payload.projectId),
      archivedAt: Timestamp.fromMillis(payload.archivedAt),
    }),
};
