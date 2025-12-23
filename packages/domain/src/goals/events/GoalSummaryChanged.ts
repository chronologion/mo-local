import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Summary } from '../vos/Summary';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalSummaryChangedPayload {
  goalId: GoalId;
  summary: Summary;
  changedAt: Timestamp;
}

export class GoalSummaryChanged
  extends DomainEvent<GoalId>
  implements GoalSummaryChangedPayload
{
  readonly eventType = goalEventTypes.goalSummaryChanged;

  readonly goalId: GoalId;
  readonly summary: Summary;
  readonly changedAt: Timestamp;

  constructor(payload: GoalSummaryChangedPayload) {
    super(payload.goalId, payload.changedAt);
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalSummaryChangedSpec = payloadEventSpec<
  GoalSummaryChanged,
  GoalSummaryChangedPayload
>(goalEventTypes.goalSummaryChanged, (p) => new GoalSummaryChanged(p), {
  goalId: voString(GoalId.from),
  summary: voString(Summary.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
