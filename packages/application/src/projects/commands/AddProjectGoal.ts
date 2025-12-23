import { BaseCommand } from '../../shared/ports/BaseCommand';

export type AddProjectGoalPayload = {
  projectId: string;
  goalId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class AddProjectGoal
  extends BaseCommand<AddProjectGoalPayload>
  implements Readonly<AddProjectGoalPayload>
{
  readonly type = 'AddProjectGoal';
  readonly projectId: string;
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: AddProjectGoalPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
