import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectMilestoneTargetDateChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectMilestoneTargetDateChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      milestoneId: MilestoneId;
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
