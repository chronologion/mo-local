import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectDateChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectDateChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      startDate: LocalDate;
      targetDate: LocalDate;
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
