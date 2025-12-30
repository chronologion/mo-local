import { BaseCommand } from '../../shared/ports/BaseCommand';

export type UnachieveGoalPayload = {
  goalId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
  correlationId?: string | null;
  causationId?: string | null;
};

export class UnachieveGoal
  extends BaseCommand<UnachieveGoalPayload>
  implements Readonly<UnachieveGoalPayload>
{
  readonly type = 'UnachieveGoal';
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;

  constructor(payload: UnachieveGoalPayload) {
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
