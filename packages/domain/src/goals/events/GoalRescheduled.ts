import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { Month } from '../vos/Month';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalRescheduledPayload {
  goalId: GoalId;
  targetMonth: Month;
  changedAt: Timestamp;
}

export class GoalRescheduled
  extends DomainEvent<GoalId>
  implements GoalRescheduledPayload
{
  readonly eventType = goalEventTypes.goalRescheduled;

  readonly goalId: GoalId;
  readonly targetMonth: Month;
  readonly changedAt: Timestamp;

  constructor(payload: GoalRescheduledPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.changedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.targetMonth = payload.targetMonth;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalRescheduledSpec = payloadEventSpec<
  GoalRescheduled,
  GoalRescheduledPayload
>(goalEventTypes.goalRescheduled, (p, meta) => new GoalRescheduled(p, meta), {
  goalId: voString(GoalId.from),
  targetMonth: voString(Month.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
