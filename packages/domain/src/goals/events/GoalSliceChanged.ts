import { DomainEvent } from '../../shared/DomainEvent';
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

  constructor(payload: GoalSliceChangedPayload) {
    super(payload.goalId, payload.changedAt);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalSliceChangedSpec = payloadEventSpec<
  GoalSliceChanged,
  GoalSliceChangedPayload
>(goalEventTypes.goalSliceChanged, (p) => new GoalSliceChanged(p), {
  goalId: voString(GoalId.from),
  slice: voString(Slice.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
