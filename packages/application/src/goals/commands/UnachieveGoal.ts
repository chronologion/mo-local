import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type UnachieveGoalPayload = {
  goalId: string;
  timestamp: number;
  knownVersion: number;
};

export class UnachieveGoal
  extends BaseCommand<UnachieveGoalPayload>
  implements Readonly<UnachieveGoalPayload>
{
  readonly goalId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: UnachieveGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
