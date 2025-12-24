import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalArchivedPayload {
  goalId: GoalId;
  archivedAt: Timestamp;
}

export class GoalArchived
  extends DomainEvent<GoalId>
  implements GoalArchivedPayload
{
  readonly eventType = goalEventTypes.goalArchived;

  readonly goalId: GoalId;
  readonly archivedAt: Timestamp;

  constructor(payload: GoalArchivedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.archivedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.archivedAt = payload.archivedAt;
    Object.freeze(this);
  }
}

export const GoalArchivedSpec = payloadEventSpec<
  GoalArchived,
  GoalArchivedPayload
>(goalEventTypes.goalArchived, (p, meta) => new GoalArchived(p, meta), {
  goalId: voString(GoalId.from),
  archivedAt: voNumber(Timestamp.fromMillis),
});
