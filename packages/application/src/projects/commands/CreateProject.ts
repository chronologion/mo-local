import { ProjectStatusValue } from '@mo/domain';
import { BaseCommand } from '../../shared/ports/BaseCommand';

export type CreateProjectPayload = {
  projectId: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description?: string;
  goalId?: string | null;
  userId: string;
  timestamp: number;
  idempotencyKey: string;
};

export class CreateProject
  extends BaseCommand<CreateProjectPayload>
  implements Readonly<CreateProjectPayload>
{
  readonly type = 'CreateProject';
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatusValue;
  readonly startDate: string;
  readonly targetDate: string;
  readonly description?: string;
  readonly goalId?: string | null;
  readonly userId: string;
  readonly timestamp: number;
  readonly idempotencyKey: string;

  constructor(payload: CreateProjectPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.status = payload.status;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.description = payload.description;
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
