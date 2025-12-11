import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectMilestoneArchived implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectMilestoneArchived;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      milestoneId: MilestoneId;
      archivedAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.archivedAt;
  }
}
