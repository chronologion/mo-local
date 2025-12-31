import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalUnachievedPayload {
  goalId: GoalId;
  unachievedAt: Timestamp;
}

export class GoalUnachieved
  extends DomainEvent<GoalId>
  implements GoalUnachievedPayload
{
  readonly eventType = goalEventTypes.goalUnachieved;

  readonly goalId: GoalId;
  readonly unachievedAt: Timestamp;

  constructor(payload: GoalUnachievedPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.unachievedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalUnachievedSpec = payloadEventSpec<
  GoalUnachieved,
  GoalUnachievedPayload,
  GoalId
>(goalEventTypes.goalUnachieved, (p, meta) => new GoalUnachieved(p, meta), {
  goalId: voString(GoalId.from),
  unachievedAt: voNumber(Timestamp.fromMillis),
});
