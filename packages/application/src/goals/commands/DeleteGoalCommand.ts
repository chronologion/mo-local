import { BaseCommand } from '../../cqrs/BaseCommand';

export type DeleteGoalCommandPayload = {
  goalId: string;
  userId: string;
  timestamp: number;
};

export class DeleteGoalCommand
  extends BaseCommand<DeleteGoalCommandPayload>
  implements Readonly<DeleteGoalCommandPayload>
{
  readonly type = 'DeleteGoal';
  readonly goalId: string;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: DeleteGoalCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
