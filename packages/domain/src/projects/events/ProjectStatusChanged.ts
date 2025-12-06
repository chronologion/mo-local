import { DomainEvent } from '../../shared/DomainEvent';
import { ProjectStatusValue } from '../ProjectStatus';
import { projectEventTypes } from './eventTypes';

export class ProjectStatusChanged implements DomainEvent {
  readonly eventType = projectEventTypes.projectStatusChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      status: ProjectStatusValue;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.changedAt;
  }
}
