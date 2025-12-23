import { DomainEvent } from '../../shared/DomainEvent';
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

  constructor(payload: GoalTargetChangedPayload) {
    super(payload.goalId, payload.changedAt);
    this.goalId = payload.goalId;
    this.targetMonth = payload.targetMonth;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalTargetChangedSpec = payloadEventSpec<
  GoalTargetChanged,
  GoalTargetChangedPayload
>(goalEventTypes.goalTargetChanged, (p) => new GoalTargetChanged(p), {
  goalId: voString(GoalId.from),
  targetMonth: voString(Month.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
