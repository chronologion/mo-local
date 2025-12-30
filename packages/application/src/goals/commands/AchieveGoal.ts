import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type AchieveGoalPayload = {
  goalId: string;
  timestamp: number;
  knownVersion: number;
};

export class AchieveGoal
  extends BaseCommand<AchieveGoalPayload>
  implements Readonly<AchieveGoalPayload>
{
  readonly goalId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: AchieveGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
