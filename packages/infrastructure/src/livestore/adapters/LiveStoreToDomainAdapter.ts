import {
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalDeleted,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
} from '@mo/domain';
import { DomainEvent } from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';

const eventConstructors: Record<string, (payload: any) => DomainEvent> = {
  GoalCreated: (payload) =>
    new GoalCreated({
      goalId: payload.goalId,
      slice: payload.slice,
      summary: payload.summary,
      targetMonth: payload.targetMonth,
      priority: payload.priority,
      createdBy: payload.createdBy,
      createdAt: new Date(payload.createdAt),
    }),
  GoalSummaryChanged: (payload) =>
    new GoalSummaryChanged({
      goalId: payload.goalId,
      summary: payload.summary,
      changedAt: new Date(payload.changedAt),
    }),
  GoalSliceChanged: (payload) =>
    new GoalSliceChanged({
      goalId: payload.goalId,
      slice: payload.slice,
      changedAt: new Date(payload.changedAt),
    }),
  GoalTargetChanged: (payload) =>
    new GoalTargetChanged({
      goalId: payload.goalId,
      targetMonth: payload.targetMonth,
      changedAt: new Date(payload.changedAt),
    }),
  GoalPriorityChanged: (payload) =>
    new GoalPriorityChanged({
      goalId: payload.goalId,
      priority: payload.priority,
      changedAt: new Date(payload.changedAt),
    }),
  GoalDeleted: (payload) =>
    new GoalDeleted({
      goalId: payload.goalId,
      deletedAt: new Date(payload.deletedAt),
    }),
  GoalAccessGranted: (payload) =>
    new GoalAccessGranted({
      goalId: payload.goalId,
      grantedTo: payload.grantedTo,
      permission: payload.permission,
      grantedAt: new Date(payload.grantedAt),
    }),
  GoalAccessRevoked: (payload) =>
    new GoalAccessRevoked({
      goalId: payload.goalId,
      revokedFrom: payload.revokedFrom,
      revokedAt: new Date(payload.revokedAt),
    }),
};

/**
 * Converts encrypted LiveStore events into domain events.
 */
export class LiveStoreToDomainAdapter {
  constructor(private readonly crypto: ICryptoService) {}

  async toDomain(lsEvent: EncryptedEvent, kGoal: Uint8Array): Promise<DomainEvent> {
    const payloadBytes = await this.crypto.decrypt(lsEvent.payload, kGoal);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    return this.createDomainEvent(lsEvent.eventType, payload);
  }

  async toDomainBatch(events: EncryptedEvent[], kGoal: Uint8Array): Promise<DomainEvent[]> {
    return Promise.all(events.map((event) => this.toDomain(event, kGoal)));
  }

  private createDomainEvent(eventType: string, payload: any): DomainEvent {
    const ctor = eventConstructors[eventType];
    if (!ctor) {
      throw new Error(`Unsupported event type: ${eventType}`);
    }
    return ctor(payload);
  }
}
