import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectArchived implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectArchived;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      archivedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.archivedAt;
  }
}
