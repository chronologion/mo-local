import { DomainEvent } from '../../shared/DomainEvent';
import { ProjectStatusValue } from '../ProjectStatus';
import { projectEventTypes } from './eventTypes';

export class ProjectCreated implements DomainEvent {
  readonly eventType = projectEventTypes.projectCreated;
  readonly occurredAt: Date;
  readonly aggregateId: string;

  constructor(
    public readonly payload: {
      projectId: string;
      name: string;
      status: ProjectStatusValue;
      startDate: string;
      targetDate: string;
      description: string;
      goalId: string | null;
      createdBy: string;
      createdAt: Date;
    }
  ) {
    this.aggregateId = payload.projectId;
    this.occurredAt = payload.createdAt;
  }
}
