import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ArchiveGoalPayload = {
  goalId: string;
  timestamp: number;
  knownVersion: number;
};

export class ArchiveGoal
  extends BaseCommand<ArchiveGoalPayload>
  implements Readonly<ArchiveGoalPayload>
{
  readonly goalId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ArchiveGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
