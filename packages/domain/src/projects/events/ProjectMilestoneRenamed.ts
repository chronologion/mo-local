import { DomainEvent, type EventMetadata } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { MilestoneName } from '../vos/MilestoneName';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectMilestoneRenamedPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  name: MilestoneName;
  changedAt: Timestamp;
}

export class ProjectMilestoneRenamed
  extends DomainEvent<ProjectId>
  implements ProjectMilestoneRenamedPayload
{
  readonly eventType = projectEventTypes.projectMilestoneRenamed;

  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly name: MilestoneName;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectMilestoneRenamedPayload, meta: EventMetadata) {
    super({
      aggregateId: payload.projectId,
      occurredAt: payload.changedAt,
      eventId: meta.eventId,
      actorId: meta.actorId,
      causationId: meta?.causationId,
      correlationId: meta?.correlationId,
    });
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneRenamedSpec = payloadEventSpec<
  ProjectMilestoneRenamed,
  ProjectMilestoneRenamedPayload
>(
  projectEventTypes.projectMilestoneRenamed,
  (p, meta) => new ProjectMilestoneRenamed(p, meta),
  {
    projectId: voString(ProjectId.from),
    milestoneId: voString(MilestoneId.from),
    name: voString(MilestoneName.from),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
