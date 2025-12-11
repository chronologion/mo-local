import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectMilestoneNameChanged implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectMilestoneNameChanged;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      milestoneId: MilestoneId;
      name: string;
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
