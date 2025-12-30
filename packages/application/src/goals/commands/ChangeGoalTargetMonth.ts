import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeGoalTargetMonthPayload = {
  goalId: string;
  targetMonth: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeGoalTargetMonth
  extends BaseCommand<ChangeGoalTargetMonthPayload>
  implements Readonly<ChangeGoalTargetMonthPayload>
{
  readonly type = 'ChangeGoalTargetMonth';
  readonly goalId: string;
  readonly targetMonth: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeGoalTargetMonthPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.targetMonth = payload.targetMonth;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
