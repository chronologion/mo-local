import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { Slice } from '../Slice';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalRecategorizedPayload {
  goalId: GoalId;
  slice: Slice;
  changedAt: Timestamp;
}

export class GoalRecategorized
  extends DomainEvent<GoalId>
  implements GoalRecategorizedPayload
{
  readonly eventType = goalEventTypes.goalRecategorized;

  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly changedAt: Timestamp;

  constructor(payload: GoalRecategorizedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.changedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalRecategorizedSpec = payloadEventSpec<
  GoalRecategorized,
  GoalRecategorizedPayload
>(
  goalEventTypes.goalRecategorized,
  (p, meta) => new GoalRecategorized(p, meta),
  {
    goalId: voString(GoalId.from),
    slice: voString(Slice.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
