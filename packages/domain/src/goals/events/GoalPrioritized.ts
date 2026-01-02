import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { Priority } from '../vos/Priority';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { goalEventTypes } from './eventTypes';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface GoalPrioritizedPayload {
  goalId: GoalId;
  priority: Priority;
  changedAt: Timestamp;
}

export class GoalPrioritized extends DomainEvent<GoalId> implements GoalPrioritizedPayload {
  readonly eventType = goalEventTypes.goalPrioritized;

  readonly goalId: GoalId;
  readonly priority: Priority;
  readonly changedAt: Timestamp;

  constructor(payload: GoalPrioritizedPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.priority = payload.priority;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalPrioritizedSpec = payloadEventSpec<GoalPrioritized, GoalPrioritizedPayload, GoalId>(
  goalEventTypes.goalPrioritized,
  (p, meta) => new GoalPrioritized(p, meta),
  {
    goalId: voString(GoalId.from),
    priority: voString(Priority.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
