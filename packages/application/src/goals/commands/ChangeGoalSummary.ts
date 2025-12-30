import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeGoalSummaryPayload = {
  goalId: string;
  summary: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeGoalSummary
  extends BaseCommand<ChangeGoalSummaryPayload>
  implements Readonly<ChangeGoalSummaryPayload>
{
  readonly goalId: string;
  readonly summary: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeGoalSummaryPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
