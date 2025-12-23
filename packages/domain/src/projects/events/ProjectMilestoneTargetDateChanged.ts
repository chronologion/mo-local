import { DomainEvent } from '../../shared/DomainEvent';
import { projectEventTypes } from './eventTypes';
import { ProjectId } from '../vos/ProjectId';
import { MilestoneId } from '../vos/MilestoneId';
import { LocalDate } from '../../shared/vos/LocalDate';
import { Timestamp } from '../../shared/vos/Timestamp';
import { payloadEventSpec, voNumber, voString } from '../../shared/eventSpec';

export interface ProjectMilestoneTargetDateChangedPayload {
  projectId: ProjectId;
  milestoneId: MilestoneId;
  targetDate: LocalDate;
  changedAt: Timestamp;
}

export class ProjectMilestoneTargetDateChanged
  extends DomainEvent<ProjectId>
  implements ProjectMilestoneTargetDateChangedPayload
{
  readonly eventType = projectEventTypes.projectMilestoneTargetDateChanged;

  readonly projectId: ProjectId;
  readonly milestoneId: MilestoneId;
  readonly targetDate: LocalDate;
  readonly changedAt: Timestamp;

  constructor(payload: ProjectMilestoneTargetDateChangedPayload) {
    super(payload.projectId, payload.changedAt);
    this.projectId = payload.projectId;
    this.milestoneId = payload.milestoneId;
    this.targetDate = payload.targetDate;
    this.changedAt = payload.changedAt;
    Object.freeze(this);
  }
}

export const ProjectMilestoneTargetDateChangedSpec = payloadEventSpec<
  ProjectMilestoneTargetDateChanged,
  ProjectMilestoneTargetDateChangedPayload
>(
  projectEventTypes.projectMilestoneTargetDateChanged,
  (p) => new ProjectMilestoneTargetDateChanged(p),
  {
    projectId: voString(ProjectId.from),
    milestoneId: voString(MilestoneId.from),
    targetDate: voString(LocalDate.fromString),
    changedAt: voNumber(Timestamp.fromMillis),
  }
);
