import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Summary } from '../vos/Summary';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalRefinedPayload {
  goalId: GoalId;
  summary: Summary;
  changedAt: Timestamp;
}

export class GoalRefined
  extends DomainEvent<GoalId>
  implements GoalRefinedPayload
{
  readonly eventType = goalEventTypes.goalRefined;

  readonly goalId: GoalId;
  readonly summary: Summary;
  readonly changedAt: Timestamp;

  constructor(payload: GoalRefinedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.changedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalRefinedSpec = payloadEventSpec<
  GoalRefined,
  GoalRefinedPayload
>(goalEventTypes.goalRefined, (p, meta) => new GoalRefined(p, meta), {
  goalId: voString(GoalId.from),
  summary: voString(Summary.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
