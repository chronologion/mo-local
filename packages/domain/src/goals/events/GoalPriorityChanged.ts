import { DomainEvent } from '../../shared/DomainEvent';
import { Priority } from '../vos/Priority';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalPriorityChangedPayload {
  goalId: GoalId;
  priority: Priority;
  changedAt: Timestamp;
}

export class GoalPriorityChanged
  extends DomainEvent<GoalId>
  implements GoalPriorityChangedPayload
{
  readonly eventType = goalEventTypes.goalPriorityChanged;

  readonly goalId: GoalId;
  readonly priority: Priority;
  readonly changedAt: Timestamp;

  constructor(payload: GoalPriorityChangedPayload) {
    super(payload.goalId, payload.changedAt);
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const GoalPriorityChangedSpec = payloadEventSpec<
  GoalPriorityChanged,
  GoalPriorityChangedPayload
>(goalEventTypes.goalPriorityChanged, (p) => new GoalPriorityChanged(p), {
  goalId: voString(GoalId.from),
  priority: voString(Priority.from),
  changedAt: voNumber(Timestamp.fromMillis),
});
