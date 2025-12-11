import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectGoalRemoved implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectGoalRemoved;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      removedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.removedAt;
  }
}
