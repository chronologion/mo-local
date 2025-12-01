import {
  ALL_SLICES,
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalDeleted,
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
} from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { z } from 'zod';

type GoalPayloadMap = {
  [eventTypes.goalCreated]: GoalCreatedPayload;
  [eventTypes.goalSummaryChanged]: GoalSummaryChangedPayload;
  [eventTypes.goalSliceChanged]: GoalSliceChangedPayload;
  [eventTypes.goalTargetChanged]: GoalTargetChangedPayload;
  [eventTypes.goalPriorityChanged]: GoalPriorityChangedPayload;
  [eventTypes.goalDeleted]: GoalDeletedPayload;
  [eventTypes.goalAccessGranted]: GoalAccessGrantedPayload;
  [eventTypes.goalAccessRevoked]: GoalAccessRevokedPayload;
};

type EventType = GoalEventType;

const supportedEvents: readonly EventType[] = [
  eventTypes.goalCreated,
  eventTypes.goalSummaryChanged,
  eventTypes.goalSliceChanged,
  eventTypes.goalTargetChanged,
  eventTypes.goalPriorityChanged,
  eventTypes.goalDeleted,
  eventTypes.goalAccessGranted,
  eventTypes.goalAccessRevoked,
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

const schemas: { [K in EventType]: z.ZodType<GoalPayloadMap[K]> } = {
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
  [eventTypes.goalDeleted]: z
    .object({
      goalId: z.string(),
      deletedAt: timestampSchema,
    })
    .strict(),
  [eventTypes.goalAccessGranted]: z
    .object({
      goalId: z.string(),
      grantedTo: z.string(),
      permission: z.enum(['owner', 'edit', 'view'] as const),
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
      case eventTypes.goalDeleted: {
        const p = this.validatePayload(eventTypes.goalDeleted, payload);
        return new GoalDeleted(p);
      }
      case eventTypes.goalAccessGranted: {
        const p = this.validatePayload(eventTypes.goalAccessGranted, payload);
        return new GoalAccessGranted(p);
      }
      case eventTypes.goalAccessRevoked: {
        const p = this.validatePayload(eventTypes.goalAccessRevoked, payload);
        return new GoalAccessRevoked(p);
      }
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
  }

  private validatePayload<T extends EventType>(
    eventType: T,
    payload: unknown
  ): GoalPayloadMap[T] {
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

type GoalDeletedPayload = {
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
