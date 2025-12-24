import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { Month } from '../vos/Month';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalTargetChangedPayload {
  goalId: GoalId;
  targetMonth: Month;
  changedAt: Timestamp;
}

export class GoalTargetChanged
  extends DomainEvent<GoalId>
  implements GoalTargetChangedPayload
{
  readonly eventType = goalEventTypes.goalTargetChanged;

  readonly goalId: GoalId;
  readonly targetMonth: Month;
  readonly changedAt: Timestamp;

  constructor(payload: GoalTargetChangedPayload, meta: EventMetadata) {
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

export const GoalTargetChangedSpec = payloadEventSpec<
  GoalTargetChanged,
  GoalTargetChangedPayload
>(
  goalEventTypes.goalTargetChanged,
  (p, meta) => new GoalTargetChanged(p, meta),
  {
    goalId: voString(GoalId.from),
    targetMonth: voString(Month.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
