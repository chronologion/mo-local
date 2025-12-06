import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';

export class ProjectNameChanged implements DomainEvent {
  readonly eventType = projectEventTypes.projectNameChanged;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      name: string;
      changedAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.changedAt;
  }
}
