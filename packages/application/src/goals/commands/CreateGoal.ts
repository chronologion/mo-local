import { PriorityLevel, SliceValue } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type CreateGoalPayload = {
  goalId: string;
  slice: SliceValue;
  summary: string;
  targetMonth: string;
  priority: PriorityLevel;
  actorId: string;
  timestamp: number;
  idempotencyKey: string;
};

export class CreateGoal
  extends BaseCommand<CreateGoalPayload>
  implements Readonly<CreateGoalPayload>
{
  readonly type = 'CreateGoal';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly summary: string;
  readonly targetMonth: string;
  readonly priority: PriorityLevel;
  readonly actorId: string;
  readonly timestamp: number;
  readonly idempotencyKey: string;

  constructor(payload: CreateGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.summary = payload.summary;
    this.targetMonth = payload.targetMonth;
    this.priority = payload.priority;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
