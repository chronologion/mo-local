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

export class GoalRescheduled extends DomainEvent<GoalId> implements GoalRescheduledPayload {
  readonly eventType = goalEventTypes.goalRescheduled;

  readonly goalId: GoalId;
  readonly targetMonth: Month;
  readonly changedAt: Timestamp;

  constructor(payload: GoalRescheduledPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.targetMonth = payload.targetMonth;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalRescheduledSpec = payloadEventSpec<GoalRescheduled, GoalRescheduledPayload, GoalId>(
  goalEventTypes.goalRescheduled,
  (p, meta) => new GoalRescheduled(p, meta),
  {
    goalId: voString(GoalId.from),
    targetMonth: voString(Month.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
