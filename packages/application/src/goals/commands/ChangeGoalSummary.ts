import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeGoalSummaryPayload = {
  goalId: string;
  summary: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeGoalSummary
  extends BaseCommand<ChangeGoalSummaryPayload>
  implements Readonly<ChangeGoalSummaryPayload>
{
  readonly type = 'ChangeGoalSummary';
  readonly goalId: string;
  readonly summary: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeGoalSummaryPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.summary = payload.summary;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
