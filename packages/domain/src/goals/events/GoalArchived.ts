import { DomainEvent } from '../../shared/DomainEvent';
import { goalEventTypes } from './eventTypes';
import { GoalId } from '../vos/GoalId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { ToJSON } from '../../shared/serialization';

export type GoalArchivedJSON = ToJSON<GoalArchived['payload']>;

export class GoalArchived implements DomainEvent<GoalId> {
  readonly eventType = goalEventTypes.goalArchived;

  constructor(
    public readonly payload: {
      goalId: GoalId;
      archivedAt: Timestamp;
    }
  ) {}

  get aggregateId(): GoalId {
    return this.payload.goalId;
  }

  get occurredAt(): Timestamp {
    return this.payload.archivedAt;
  }

  toJSON(): GoalArchivedJSON {
    return {
      goalId: this.payload.goalId.value,
      archivedAt: this.payload.archivedAt.value,
    };
  }

  static fromJSON(json: GoalArchivedJSON): GoalArchived {
    return new GoalArchived({
      goalId: GoalId.from(json.goalId),
      archivedAt: Timestamp.fromMillis(json.archivedAt),
    });
  }
}
