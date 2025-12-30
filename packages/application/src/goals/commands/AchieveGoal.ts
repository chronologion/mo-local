import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type AchieveGoalPayload = {
  goalId: string;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class AchieveGoal
  extends BaseCommand<AchieveGoalPayload>
  implements Readonly<AchieveGoalPayload>
{
  readonly type = 'AchieveGoal';
  readonly goalId: string;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: AchieveGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
