import { PriorityLevel } from '@mo/domain';
import { BaseCommand } from '../../cqrs/BaseCommand';

export type ChangeGoalPriorityCommandPayload = {
  goalId: string;
  priority: PriorityLevel;
  userId: string;
  timestamp: number;
};

export class ChangeGoalPriorityCommand
  extends BaseCommand<ChangeGoalPriorityCommandPayload>
  implements Readonly<ChangeGoalPriorityCommandPayload>
{
  readonly type = 'ChangeGoalPriority';
  readonly goalId: string;
  readonly priority: PriorityLevel;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalPriorityCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
