import {
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalDeleted,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
  SliceValue,
  PriorityLevel,
  Permission,
  DomainEvent,
} from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';

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
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(`Payload for ${eventType} must be an object`);
    }
    const p = payload as Record<string, unknown>;
    const requireString = (key: string) => {
      if (typeof p[key] !== 'string')
        throw new Error(`Payload.${key} must be string`);
      return p[key] as string;
    };
    const parseTimestamp = (value: unknown, key: string) => {
      const date = new Date(value as string | number | Date);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Payload.${key} is not a valid timestamp`);
      }
      return date;
    };

    if (!supportedEvents.includes(eventType)) {
      throw new Error(`Unsupported event type: ${eventType}`);
    }

    switch (eventType) {
      case 'GoalCreated':
        return {
          goalId: requireString('goalId'),
          slice: requireString('slice') as SliceValue,
          summary: requireString('summary'),
          targetMonth: requireString('targetMonth'),
          priority: requireString('priority') as PriorityLevel,
          createdBy: requireString('createdBy'),
          createdAt: parseTimestamp(p.createdAt, 'createdAt'),
        } as GoalPayloadMap[T];
      case 'GoalSummaryChanged':
        return {
          goalId: requireString('goalId'),
          summary: requireString('summary'),
          changedAt: parseTimestamp(p.changedAt, 'changedAt'),
        } as GoalPayloadMap[T];
      case 'GoalSliceChanged':
        return {
          goalId: requireString('goalId'),
          slice: requireString('slice') as SliceValue,
          changedAt: parseTimestamp(p.changedAt, 'changedAt'),
        } as GoalPayloadMap[T];
      case 'GoalTargetChanged':
        return {
          goalId: requireString('goalId'),
          targetMonth: requireString('targetMonth'),
          changedAt: parseTimestamp(p.changedAt, 'changedAt'),
        } as GoalPayloadMap[T];
      case 'GoalPriorityChanged':
        return {
          goalId: requireString('goalId'),
          priority: requireString('priority') as PriorityLevel,
          changedAt: parseTimestamp(p.changedAt, 'changedAt'),
        } as GoalPayloadMap[T];
      case 'GoalDeleted':
        return {
          goalId: requireString('goalId'),
          deletedAt: parseTimestamp(p.deletedAt, 'deletedAt'),
        } as GoalPayloadMap[T];
      case 'GoalAccessGranted':
        return {
          goalId: requireString('goalId'),
          grantedTo: requireString('grantedTo'),
          permission: requireString('permission') as Permission,
          grantedAt: parseTimestamp(p.grantedAt, 'grantedAt'),
        } as GoalPayloadMap[T];
      case 'GoalAccessRevoked':
        return {
          goalId: requireString('goalId'),
          revokedFrom: requireString('revokedFrom'),
          revokedAt: parseTimestamp(p.revokedAt, 'revokedAt'),
        } as GoalPayloadMap[T];
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }
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
