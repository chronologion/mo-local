import { SliceValue } from '@mo/domain';
import { BaseCommand } from '../../cqrs/BaseCommand';

export type ChangeGoalSliceCommandPayload = {
  goalId: string;
  slice: SliceValue;
  userId: string;
  timestamp: number;
};

export class ChangeGoalSliceCommand
  extends BaseCommand<ChangeGoalSliceCommandPayload>
  implements Readonly<ChangeGoalSliceCommandPayload>
{
  readonly type = 'ChangeGoalSlice';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalSliceCommandPayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
