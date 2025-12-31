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

  constructor(payload: GoalArchivedPayload, meta: EventMetadata<GoalId>) {
    super(meta);
    this.goalId = this.aggregateId;
    this.archivedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const GoalArchivedSpec = payloadEventSpec<
  GoalArchived,
  GoalArchivedPayload,
  GoalId
>(goalEventTypes.goalArchived, (p, meta) => new GoalArchived(p, meta), {
  goalId: voString(GoalId.from),
  archivedAt: voNumber(Timestamp.fromMillis),
});
