import { SliceValue } from '@mo/domain';
import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type ChangeGoalSlicePayload = {
  goalId: string;
  slice: SliceValue;
  timestamp: number;
  knownVersion: number;
};

export class ChangeGoalSlice extends BaseCommand<ChangeGoalSlicePayload> implements Readonly<ChangeGoalSlicePayload> {
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeGoalSlicePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
