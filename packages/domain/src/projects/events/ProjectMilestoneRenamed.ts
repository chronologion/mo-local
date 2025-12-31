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

  constructor(
    payload: ProjectMilestoneRenamedPayload,
    meta: EventMetadata<ProjectId>
  ) {
    super(meta);
    this.projectId = this.aggregateId;
    this.milestoneId = payload.milestoneId;
    this.name = payload.name;
    this.changedAt = this.occurredAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneRenamedSpec = payloadEventSpec<
  ProjectMilestoneRenamed,
  ProjectMilestoneRenamedPayload,
  ProjectId
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
