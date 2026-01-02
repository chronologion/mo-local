import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectMilestoneArchivedPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  archivedAt: Timestamp;
}

export class ProjectMilestoneArchived extends DomainEvent<ProjectId> implements ProjectMilestoneArchivedPayload {
  readonly eventType = projectEventTypes.projectMilestoneArchived;

  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly archivedAt: Timestamp;

  constructor(payload: ProjectMilestoneArchivedPayload, meta: EventMetadata<ProjectId>) {
    super(meta);
    this.projectId = this.aggregateId;
    this.milestoneId = payload.milestoneId;
    this.archivedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneArchivedSpec = payloadEventSpec<
  ProjectMilestoneArchived,
  ProjectMilestoneArchivedPayload,
  ProjectId
>(projectEventTypes.projectMilestoneArchived, (p, meta) => new ProjectMilestoneArchived(p, meta), {
  projectId: voString(ProjectId.from),
  milestoneId: voString(MilestoneId.from),
  archivedAt: voNumber(Timestamp.fromMillis),
});
