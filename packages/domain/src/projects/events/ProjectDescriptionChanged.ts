import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectDescription } from '../vos/ProjectDescription';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectDescriptionChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectDescriptionChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      description: ProjectDescription;
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
