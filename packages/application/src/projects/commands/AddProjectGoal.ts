import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type AddProjectGoalPayload = {
  projectId: string;
  goalId: string;
  timestamp: number;
  knownVersion: number;
};

export class AddProjectGoal extends BaseCommand<AddProjectGoalPayload> implements Readonly<AddProjectGoalPayload> {
  readonly projectId: string;
  readonly goalId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: AddProjectGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.goalId = payload.goalId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
