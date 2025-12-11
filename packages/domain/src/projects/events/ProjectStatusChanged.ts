import { DomainEvent } from '../../shared/DomainEvent';
import { ProjectStatus } from '../vos/ProjectStatus';
import { ProjectId } from '../vos/ProjectId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { projectEventTypes } from './eventTypes';

export class ProjectStatusChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectStatusChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      status: ProjectStatus;
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
