import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { Priority } from '../vos/Priority';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalPriorityChangedPayload {
  goalId: GoalId;
  priority: Priority;
  changedAt: Timestamp;
}

export class GoalPriorityChanged
  extends DomainEvent<GoalId>
  implements GoalPriorityChangedPayload
{
  readonly eventType = goalEventTypes.goalPriorityChanged;

  readonly goalId: GoalId;
  readonly priority: Priority;
  readonly changedAt: Timestamp;

  constructor(payload: GoalPriorityChangedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.changedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalPriorityChangedSpec = payloadEventSpec<
  GoalPriorityChanged,
  GoalPriorityChangedPayload
>(
  goalEventTypes.goalPriorityChanged,
  (p, meta) => new GoalPriorityChanged(p, meta),
  {
    goalId: voString(GoalId.from),
    priority: voString(Priority.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
