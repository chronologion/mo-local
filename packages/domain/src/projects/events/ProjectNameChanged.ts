import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectName } from '../vos/ProjectName';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectNameChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectNameChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      name: ProjectName;
      changedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.changedAt;
  }
}
