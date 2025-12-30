import { BaseCommand } from '../../shared/ports/BaseCommand';

export type AchieveGoalPayload = {
  goalId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
  correlationId?: string | null;
  causationId?: string | null;
};

export class AchieveGoal
  extends BaseCommand<AchieveGoalPayload>
  implements Readonly<AchieveGoalPayload>
{
  readonly type = 'AchieveGoal';
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;

  constructor(payload: AchieveGoalPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
    this.correlationId = payload.correlationId;
    this.causationId = payload.causationId;
  }
}
