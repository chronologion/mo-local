import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { ProjectName } from '../vos/ProjectName';
import { ProjectStatus } from '../vos/ProjectStatus';
import { LocalDate } from '../../shared/vos/LocalDate';
import { ProjectDescription } from '../vos/ProjectDescription';
import { GoalId } from '../../goals/vos/GoalId';
import { UserId } from '../../identity/UserId';
import { Timestamp } from '../../shared/vos/Timestamp';

export class ProjectCreated implements DomainEvent<ProjectId> {
  readonly eventType = projectEventTypes.projectCreated;

  constructor(
    public readonly payload: {
      projectId: ProjectId;
      name: ProjectName;
      status: ProjectStatus;
      startDate: LocalDate;
      targetDate: LocalDate;
      description: ProjectDescription;
      goalId: GoalId | null;
      createdBy: UserId;
      createdAt: Timestamp;
    }
  ) {}

  get aggregateId(): ProjectId {
    return this.payload.projectId;
  }

  get occurredAt(): Timestamp {
    return this.payload.createdAt;
  }
}
