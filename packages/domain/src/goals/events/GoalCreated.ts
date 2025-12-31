import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { Slice } from '../Slice';
import { Priority } from '../vos/Priority';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Summary } from '../vos/Summary';
import { Month } from '../vos/Month';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalCreatedPayload {
  goalId: GoalId;
  slice: Slice;
  summary: Summary;
  targetMonth: Month;
  priority: Priority;
  createdBy: UserId;
  createdAt: Timestamp;
}

export class GoalCreated
  extends DomainEvent<GoalId>
  implements GoalCreatedPayload
{
  readonly eventType = goalEventTypes.goalCreated;
  readonly goalId: GoalId;
  readonly slice: Slice;
  readonly summary: Summary;
  readonly targetMonth: Month;
  readonly priority: Priority;
  readonly createdBy: UserId;
  readonly createdAt: Timestamp;

  constructor(payload: GoalCreatedPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.slice = payload.slice;
    this.summary = payload.summary;
    this.targetMonth = payload.targetMonth;
    this.priority = payload.priority;
    this.createdBy = payload.createdBy;
    this.createdAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalCreatedSpec = payloadEventSpec<
  GoalCreated,
  GoalCreatedPayload,
  GoalId
>(goalEventTypes.goalCreated, (p, meta) => new GoalCreated(p, meta), {
  goalId: voString(GoalId.from),
  slice: voString(Slice.from),
  summary: voString(Summary.from),
  targetMonth: voString(Month.from),
  priority: voString(Priority.from),
  createdBy: voString(UserId.from),
  createdAt: voNumber(Timestamp.fromMillis),
});
