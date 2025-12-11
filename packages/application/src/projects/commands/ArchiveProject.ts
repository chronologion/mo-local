import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ArchiveProjectPayload = {
  projectId: string;
  userId: string;
  timestamp: number;
};

export class ArchiveProject
  extends BaseCommand<ArchiveProjectPayload>
  implements Readonly<ArchiveProjectPayload>
{
  readonly type = 'ArchiveProject';
  readonly projectId: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ArchiveProjectPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
