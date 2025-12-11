import { SliceValue } from '@mo/domain';
import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeGoalSlicePayload = {
  goalId: string;
  slice: SliceValue;
  userId: string;
  timestamp: number;
};

export class ChangeGoalSlice
  extends BaseCommand<ChangeGoalSlicePayload>
  implements Readonly<ChangeGoalSlicePayload>
{
  readonly type = 'ChangeGoalSlice';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly userId: string;
  readonly timestamp: number;

  constructor(payload: ChangeGoalSlicePayload) {
    super(payload);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
  }
}
