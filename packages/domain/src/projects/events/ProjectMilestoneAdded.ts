import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectMilestoneAdded implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectMilestoneAdded;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      milestoneId: MilestoneId;
      name: string;
      targetDate: LocalDate;
      addedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.addedAt;
  }
}
