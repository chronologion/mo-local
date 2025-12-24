import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { Slice } from '../Slice';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalSliceChangedPayload {
  goalId: GoalId;
  slice: Slice;
  changedAt: Timestamp;
}

export class GoalSliceChanged
  extends DomainEvent<GoalId>
  implements GoalSliceChangedPayload
{
  readonly eventType = goalEventTypes.goalSliceChanged;

  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly changedAt: Timestamp;

  constructor(payload: GoalSliceChangedPayload, meta?: EventMetadata) {
    super({
      aggregateId: payload.goalId,
      occurredAt: payload.changedAt,
      eventId: meta?.eventId,
      actorId: meta?.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalSliceChangedSpec = payloadEventSpec<
  GoalSliceChanged,
  GoalSliceChangedPayload
>(goalEventTypes.goalSliceChanged, (p, meta) => new GoalSliceChanged(p, meta), {
  goalId: voString(GoalId.from),
  slice: voString(Slice.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
