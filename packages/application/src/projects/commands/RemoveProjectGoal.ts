import { BaseCommand } from '../../shared/ports/BaseCommand';

export type RemoveProjectGoalPayload = {
  projectId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class RemoveProjectGoal
  extends BaseCommand<RemoveProjectGoalPayload>
  implements Readonly<RemoveProjectGoalPayload>
{
  readonly type = 'RemoveProjectGoal';
  readonly projectId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: RemoveProjectGoalPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
