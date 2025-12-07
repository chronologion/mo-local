import {
  ALL_SLICES,
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalArchived,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
  PriorityLevel,
  Permission,
  SliceValue,
  DomainEvent,
  eventTypes,
  GoalEventType,
  projectEventTypes,
  ProjectEventType,
  ProjectStatusValue,
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
} from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { z } from 'zod';

type GoalPayloadMap = {
  [eventTypes.goalCreated]: GoalCreatedPayload;
  [eventTypes.goalSummaryChanged]: GoalSummaryChangedPayload;
  [eventTypes.goalSliceChanged]: GoalSliceChangedPayload;
  [eventTypes.goalTargetChanged]: GoalTargetChangedPayload;
  [eventTypes.goalPriorityChanged]: GoalPriorityChangedPayload;
  [eventTypes.goalArchived]: GoalArchivedPayload;
  [eventTypes.goalAccessGranted]: GoalAccessGrantedPayload;
  [eventTypes.goalAccessRevoked]: GoalAccessRevokedPayload;
};

type ProjectPayloadMap = {
  [projectEventTypes.projectCreated]: ProjectCreatedPayload;
  [projectEventTypes.projectStatusChanged]: ProjectStatusChangedPayload;
  [projectEventTypes.projectDateChanged]: ProjectDateChangedPayload;
  [projectEventTypes.projectNameChanged]: ProjectNameChangedPayload;
  [projectEventTypes.projectDescriptionChanged]: ProjectDescriptionChangedPayload;
  [projectEventTypes.projectGoalAdded]: ProjectGoalAddedPayload;
  [projectEventTypes.projectGoalRemoved]: ProjectGoalRemovedPayload;
  [projectEventTypes.projectMilestoneAdded]: ProjectMilestoneAddedPayload;
  [projectEventTypes.projectMilestoneTargetDateChanged]: ProjectMilestoneTargetDateChangedPayload;
  [projectEventTypes.projectMilestoneNameChanged]: ProjectMilestoneNameChangedPayload;
  [projectEventTypes.projectMilestoneDeleted]: ProjectMilestoneDeletedPayload;
  [projectEventTypes.projectArchived]: ProjectArchivedPayload;
};

type PayloadMap = GoalPayloadMap & ProjectPayloadMap;

type EventType = GoalEventType | ProjectEventType;

const supportedEvents: readonly EventType[] = [
  eventTypes.goalCreated,
  eventTypes.goalSummaryChanged,
  eventTypes.goalSliceChanged,
  eventTypes.goalTargetChanged,
  eventTypes.goalPriorityChanged,
  eventTypes.goalArchived,
  eventTypes.goalAccessGranted,
  eventTypes.goalAccessRevoked,
  projectEventTypes.projectCreated,
  projectEventTypes.projectStatusChanged,
  projectEventTypes.projectDateChanged,
  projectEventTypes.projectNameChanged,
  projectEventTypes.projectDescriptionChanged,
  projectEventTypes.projectGoalAdded,
  projectEventTypes.projectGoalRemoved,
  projectEventTypes.projectMilestoneAdded,
  projectEventTypes.projectMilestoneTargetDateChanged,
  projectEventTypes.projectMilestoneNameChanged,
  projectEventTypes.projectMilestoneDeleted,
  projectEventTypes.projectArchived,
];

const isEventType = (value: string): value is EventType =>
  (supportedEvents as readonly string[]).includes(value);

const timestampSchema = z
  .union([z.string(), z.number(), z.date()])
  .transform((value, ctx) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid timestamp',
      });
      return z.NEVER;
    }
    return parsed;
  });

const schemas: { [K in EventType]: z.ZodType<PayloadMap[K]> } = {
  [eventTypes.goalCreated]: z
    .object({
      goalId: z.string(),
      slice: z.enum(ALL_SLICES as [SliceValue, ...SliceValue[]]),
      summary: z.string(),
      targetMonth: z.string(),
      priority: z.enum(['must', 'should', 'maybe'] as const),
      createdBy: z.string(),
      createdAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalSummaryChanged]: z
    .object({
      goalId: z.string(),
      summary: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalSliceChanged]: z
    .object({
      goalId: z.string(),
      slice: z.enum(ALL_SLICES as [SliceValue, ...SliceValue[]]),
      changedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalTargetChanged]: z
    .object({
      goalId: z.string(),
      targetMonth: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalPriorityChanged]: z
    .object({
      goalId: z.string(),
      priority: z.enum(['must', 'should', 'maybe'] as const),
      changedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalArchived]: z
    .object({
      goalId: z.string(),
      deletedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalAccessGranted]: z
    .object({
      goalId: z.string(),
      grantedTo: z.string(),
      permission: z.enum(['view', 'edit'] as const),
      grantedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalAccessRevoked]: z
    .object({
      goalId: z.string(),
      revokedFrom: z.string(),
      revokedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectCreated]: z
    .object({
      projectId: z.string(),
      name: z.string(),
      status: z.enum(['planned', 'in_progress', 'completed', 'canceled']),
      startDate: z.string(),
      targetDate: z.string(),
      description: z.string(),
      goalId: z.string().nullable(),
      createdBy: z.string(),
      createdAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectStatusChanged]: z
    .object({
      projectId: z.string(),
      status: z.enum(['planned', 'in_progress', 'completed', 'canceled']),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectDateChanged]: z
    .object({
      projectId: z.string(),
      startDate: z.string(),
      targetDate: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectNameChanged]: z
    .object({
      projectId: z.string(),
      name: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectDescriptionChanged]: z
    .object({
      projectId: z.string(),
      description: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectGoalAdded]: z
    .object({
      projectId: z.string(),
      goalId: z.string(),
      addedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectGoalRemoved]: z
    .object({
      projectId: z.string(),
      removedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectMilestoneAdded]: z
    .object({
      projectId: z.string(),
      milestoneId: z.string(),
      name: z.string(),
      targetDate: z.string(),
      addedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectMilestoneTargetDateChanged]: z
    .object({
      projectId: z.string(),
      milestoneId: z.string(),
      targetDate: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectMilestoneNameChanged]: z
    .object({
      projectId: z.string(),
      milestoneId: z.string(),
      name: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectMilestoneDeleted]: z
    .object({
      projectId: z.string(),
      milestoneId: z.string(),
      deletedAt: timestampSchema,
    })
    .strict(),
  [projectEventTypes.projectArchived]: z
    .object({
      projectId: z.string(),
      deletedAt: timestampSchema,
    })
    .strict(),
};

/**
 * Converts encrypted LiveStore events into domain events.
 */
export class LiveStoreToDomainAdapter {
  constructor(private readonly crypto: ICryptoService) {}

  async toDomain(
    lsEvent: EncryptedEvent,
    kGoal: Uint8Array
  ): Promise<DomainEvent> {
    const aad = new TextEncoder().encode(
      `${lsEvent.aggregateId}:${lsEvent.eventType}:${lsEvent.version}`
    );
    let payloadBytes: Uint8Array;
    try {
      payloadBytes = await this.crypto.decrypt(lsEvent.payload, kGoal, aad);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      throw new Error(
        `Failed to decrypt ${lsEvent.eventType} for ${lsEvent.aggregateId}: ${message}`
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid JSON payload';
      throw new Error(`Malformed payload for ${lsEvent.eventType}: ${message}`);
    }

    if (!isEventType(lsEvent.eventType)) {
      throw new Error(`Unsupported event type: ${lsEvent.eventType}`);
    }
    return this.createDomainEvent(lsEvent.eventType, payload);
  }

  async toDomainBatch(
    events: EncryptedEvent[],
    kGoal: Uint8Array
  ): Promise<DomainEvent[]> {
    return Promise.all(events.map((event) => this.toDomain(event, kGoal)));
  }

  private createDomainEvent(
    eventType: EventType,
    payload: unknown
  ): DomainEvent {
    switch (eventType) {
      case eventTypes.goalCreated: {
        const p = this.validatePayload(eventTypes.goalCreated, payload);
        return new GoalCreated(p);
      }
      case eventTypes.goalSummaryChanged: {
        const p = this.validatePayload(eventTypes.goalSummaryChanged, payload);
        return new GoalSummaryChanged(p);
      }
      case eventTypes.goalSliceChanged: {
        const p = this.validatePayload(eventTypes.goalSliceChanged, payload);
        return new GoalSliceChanged(p);
      }
      case eventTypes.goalTargetChanged: {
        const p = this.validatePayload(eventTypes.goalTargetChanged, payload);
        return new GoalTargetChanged(p);
      }
      case eventTypes.goalPriorityChanged: {
        const p = this.validatePayload(eventTypes.goalPriorityChanged, payload);
        return new GoalPriorityChanged(p);
      }
      case eventTypes.goalArchived: {
        const p = this.validatePayload(eventTypes.goalArchived, payload);
        return new GoalArchived(p);
      }
      case eventTypes.goalAccessGranted: {
        const p = this.validatePayload(eventTypes.goalAccessGranted, payload);
        return new GoalAccessGranted(p);
      }
      case eventTypes.goalAccessRevoked: {
        const p = this.validatePayload(eventTypes.goalAccessRevoked, payload);
        return new GoalAccessRevoked(p);
      }
      case projectEventTypes.projectCreated: {
        const p = this.validatePayload(
          projectEventTypes.projectCreated,
          payload
        );
        return new ProjectCreated(p);
      }
      case projectEventTypes.projectStatusChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectStatusChanged,
          payload
        );
        return new ProjectStatusChanged(p);
      }
      case projectEventTypes.projectDateChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectDateChanged,
          payload
        );
        return new ProjectDateChanged(p);
      }
      case projectEventTypes.projectNameChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectNameChanged,
          payload
        );
        return new ProjectNameChanged(p);
      }
      case projectEventTypes.projectDescriptionChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectDescriptionChanged,
          payload
        );
        return new ProjectDescriptionChanged(p);
      }
      case projectEventTypes.projectGoalAdded: {
        const p = this.validatePayload(
          projectEventTypes.projectGoalAdded,
          payload
        );
        return new ProjectGoalAdded(p);
      }
      case projectEventTypes.projectGoalRemoved: {
        const p = this.validatePayload(
          projectEventTypes.projectGoalRemoved,
          payload
        );
        return new ProjectGoalRemoved(p);
      }
      case projectEventTypes.projectMilestoneAdded: {
        const p = this.validatePayload(
          projectEventTypes.projectMilestoneAdded,
          payload
        );
        return new ProjectMilestoneAdded(p);
      }
      case projectEventTypes.projectMilestoneTargetDateChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectMilestoneTargetDateChanged,
          payload
        );
        return new ProjectMilestoneTargetDateChanged(p);
      }
      case projectEventTypes.projectMilestoneNameChanged: {
        const p = this.validatePayload(
          projectEventTypes.projectMilestoneNameChanged,
          payload
        );
        return new ProjectMilestoneNameChanged(p);
      }
      case projectEventTypes.projectMilestoneDeleted: {
        const p = this.validatePayload(
          projectEventTypes.projectMilestoneDeleted,
          payload
        );
        return new ProjectMilestoneDeleted(p);
      }
      case projectEventTypes.projectArchived: {
        const p = this.validatePayload(
          projectEventTypes.projectArchived,
          payload
        );
        return new ProjectArchived(p);
      }
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
  }

  private validatePayload<T extends EventType>(
    eventType: T,
    payload: unknown
  ): PayloadMap[T] {
    const result = schemas[eventType].safeParse(payload);
    if (result.success) {
      return result.data;
    }

    const issues = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid payload for ${eventType}: ${issues}`);
  }
}

type GoalCreatedPayload = {
  goalId: string;
  slice: SliceValue;
  summary: string;
  targetMonth: string;
  priority: PriorityLevel;
  createdBy: string;
  createdAt: Date;
};

type GoalSummaryChangedPayload = {
  goalId: string;
  summary: string;
  changedAt: Date;
};

type GoalSliceChangedPayload = {
  goalId: string;
  slice: SliceValue;
  changedAt: Date;
};

type GoalTargetChangedPayload = {
  goalId: string;
  targetMonth: string;
  changedAt: Date;
};

type GoalPriorityChangedPayload = {
  goalId: string;
  priority: PriorityLevel;
  changedAt: Date;
};

type GoalArchivedPayload = {
  goalId: string;
  deletedAt: Date;
};

type GoalAccessGrantedPayload = {
  goalId: string;
  grantedTo: string;
  permission: Permission;
  grantedAt: Date;
};

type GoalAccessRevokedPayload = {
  goalId: string;
  revokedFrom: string;
  revokedAt: Date;
};

type ProjectCreatedPayload = {
  projectId: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  createdBy: string;
  createdAt: Date;
};

type ProjectStatusChangedPayload = {
  projectId: string;
  status: ProjectStatusValue;
  changedAt: Date;
};

type ProjectDateChangedPayload = {
  projectId: string;
  startDate: string;
  targetDate: string;
  changedAt: Date;
};

type ProjectNameChangedPayload = {
  projectId: string;
  name: string;
  changedAt: Date;
};

type ProjectDescriptionChangedPayload = {
  projectId: string;
  description: string;
  changedAt: Date;
};

type ProjectGoalAddedPayload = {
  projectId: string;
  goalId: string;
  addedAt: Date;
};

type ProjectGoalRemovedPayload = {
  projectId: string;
  removedAt: Date;
};

type ProjectMilestoneAddedPayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  targetDate: string;
  addedAt: Date;
};

type ProjectMilestoneTargetDateChangedPayload = {
  projectId: string;
  milestoneId: string;
  targetDate: string;
  changedAt: Date;
};

type ProjectMilestoneNameChangedPayload = {
  projectId: string;
  milestoneId: string;
  name: string;
  changedAt: Date;
};

type ProjectMilestoneDeletedPayload = {
  projectId: string;
  milestoneId: string;
  deletedAt: Date;
};

type ProjectArchivedPayload = {
  projectId: string;
  deletedAt: Date;
};
