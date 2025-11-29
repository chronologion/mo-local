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
} from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { z } from 'zod';

type GoalPayloadMap = {
  GoalCreated: GoalCreatedPayload;
  GoalSummaryChanged: GoalSummaryChangedPayload;
  GoalSliceChanged: GoalSliceChangedPayload;
  GoalTargetChanged: GoalTargetChangedPayload;
  GoalPriorityChanged: GoalPriorityChangedPayload;
  GoalDeleted: GoalDeletedPayload;
  GoalAccessGranted: GoalAccessGrantedPayload;
  GoalAccessRevoked: GoalAccessRevokedPayload;
};

type EventType = keyof GoalPayloadMap;

const supportedEvents: readonly EventType[] = [
  'GoalCreated',
  'GoalSummaryChanged',
  'GoalSliceChanged',
  'GoalTargetChanged',
  'GoalPriorityChanged',
  'GoalDeleted',
  'GoalAccessGranted',
  'GoalAccessRevoked',
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
  GoalCreated: z
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
  GoalSummaryChanged: z
    .object({
      goalId: z.string(),
      summary: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  GoalSliceChanged: z
    .object({
      goalId: z.string(),
      slice: z.enum(ALL_SLICES as [SliceValue, ...SliceValue[]]),
      changedAt: timestampSchema,
    })
    .strict(),
  GoalTargetChanged: z
    .object({
      goalId: z.string(),
      targetMonth: z.string(),
      changedAt: timestampSchema,
    })
    .strict(),
  GoalPriorityChanged: z
    .object({
      goalId: z.string(),
      priority: z.enum(['must', 'should', 'maybe'] as const),
      changedAt: timestampSchema,
    })
    .strict(),
  GoalDeleted: z
    .object({
      goalId: z.string(),
      deletedAt: timestampSchema,
    })
    .strict(),
  GoalAccessGranted: z
    .object({
      goalId: z.string(),
      grantedTo: z.string(),
      permission: z.enum(['owner', 'edit', 'view'] as const),
      grantedAt: timestampSchema,
    })
    .strict(),
  GoalAccessRevoked: z
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
      case 'GoalCreated': {
        const p = this.validatePayload('GoalCreated', payload);
        return new GoalCreated(p);
      }
      case 'GoalSummaryChanged': {
        const p = this.validatePayload('GoalSummaryChanged', payload);
        return new GoalSummaryChanged(p);
      }
      case 'GoalSliceChanged': {
        const p = this.validatePayload('GoalSliceChanged', payload);
        return new GoalSliceChanged(p);
      }
      case 'GoalTargetChanged': {
        const p = this.validatePayload('GoalTargetChanged', payload);
        return new GoalTargetChanged(p);
      }
      case 'GoalPriorityChanged': {
        const p = this.validatePayload('GoalPriorityChanged', payload);
        return new GoalPriorityChanged(p);
      }
      case 'GoalDeleted': {
        const p = this.validatePayload('GoalDeleted', payload);
        return new GoalDeleted(p);
      }
      case 'GoalAccessGranted': {
        const p = this.validatePayload('GoalAccessGranted', payload);
        return new GoalAccessGranted(p);
      }
      case 'GoalAccessRevoked': {
        const p = this.validatePayload('GoalAccessRevoked', payload);
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
