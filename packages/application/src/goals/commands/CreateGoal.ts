import { PriorityLevel, SliceValue } from '@mo/domain';
import { BaseCommand } from '../../shared/ports/BaseCommand';

export type CreateGoalPayload = {
  goalId: string;
  slice: SliceValue;
  summary: string;
  targetMonth: string;
  priority: PriorityLevel;
  userId: string;
  timestamp: number;
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
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: CreateGoalPayload) {
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
