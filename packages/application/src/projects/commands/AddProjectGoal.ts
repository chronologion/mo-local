import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type AddProjectGoalPayload = {
  projectId: string;
  goalId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
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
  readonly idempotencyKey: string;

  constructor(payload: AddProjectGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
