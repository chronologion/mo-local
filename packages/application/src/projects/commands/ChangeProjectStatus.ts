import { ProjectStatusValue } from '@mo/domain';
import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeProjectStatusPayload = {
  projectId: string;
  status: ProjectStatusValue;
  userId: string;
  timestamp: number;
};

export class ChangeProjectStatus
  extends BaseCommand<ChangeProjectStatusPayload>
  implements Readonly<ChangeProjectStatusPayload>
{
  readonly type = 'ChangeProjectStatus';
  readonly projectId: string;
  readonly status: ProjectStatusValue;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeProjectStatusPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.status = payload.status;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
