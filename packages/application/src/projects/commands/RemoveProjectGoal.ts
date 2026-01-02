import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type RemoveProjectGoalPayload = {
  projectId: string;
  timestamp: number;
  knownVersion: number;
};

export class RemoveProjectGoal
  extends BaseCommand<RemoveProjectGoalPayload>
  implements Readonly<RemoveProjectGoalPayload>
{
  readonly projectId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: RemoveProjectGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
