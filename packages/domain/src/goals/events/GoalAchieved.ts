import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalAchievedPayload {
  goalId: GoalId;
  achievedAt: Timestamp;
}

export class GoalAchieved
  extends DomainEvent<GoalId>
  implements GoalAchievedPayload
{
  readonly eventType = goalEventTypes.goalAchieved;

  readonly goalId: GoalId;
  readonly achievedAt: Timestamp;

  constructor(payload: GoalAchievedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.achievedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.achievedAt = payload.achievedAt;
    Object.freeze(this);
  }
}

export const GoalAchievedSpec = payloadEventSpec<
  GoalAchieved,
  GoalAchievedPayload
>(goalEventTypes.goalAchieved, (p, meta) => new GoalAchieved(p, meta), {
  goalId: voString(GoalId.from),
  achievedAt: voNumber(Timestamp.fromMillis),
});
