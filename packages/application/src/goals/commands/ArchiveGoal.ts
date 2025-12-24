import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ArchiveGoalPayload = {
  goalId: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ArchiveGoal
  extends BaseCommand<ArchiveGoalPayload>
  implements Readonly<ArchiveGoalPayload>
{
  readonly type = 'ArchiveGoal';
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ArchiveGoalPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
