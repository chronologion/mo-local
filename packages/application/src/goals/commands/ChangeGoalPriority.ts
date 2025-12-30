import { PriorityLevel } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeGoalPriorityPayload = {
  goalId: string;
  priority: PriorityLevel;
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
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeGoalPriorityPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
