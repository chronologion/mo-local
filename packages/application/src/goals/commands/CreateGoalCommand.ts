import { PriorityLevel, SliceValue } from '@mo/domain';
import { BaseCommand } from '../../cqrs/BaseCommand';

export type CreateGoalCommandPayload = {
  goalId: string;
  slice: SliceValue;
  summary: string;
  targetMonth: string;
  priority: PriorityLevel;
  userId: string;
  timestamp: number;
};

export class CreateGoalCommand
  extends BaseCommand<CreateGoalCommandPayload>
  implements Readonly<CreateGoalCommandPayload>
{
  readonly type = 'CreateGoal';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly summary: string;
  readonly targetMonth: string;
  readonly priority: PriorityLevel;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: CreateGoalCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.summary = payload.summary;
    this.targetMonth = payload.targetMonth;
    this.priority = payload.priority;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
