import { PriorityLevel } from '@mo/domain';
import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeGoalPriorityPayload = {
  goalId: string;
  priority: PriorityLevel;
  userId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeGoalPriority
  extends BaseCommand<ChangeGoalPriorityPayload>
  implements Readonly<ChangeGoalPriorityPayload>
{
  readonly type = 'ChangeGoalPriority';
  readonly goalId: string;
  readonly priority: PriorityLevel;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeGoalPriorityPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
