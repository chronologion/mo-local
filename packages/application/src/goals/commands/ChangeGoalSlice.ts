import { SliceValue } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeGoalSlicePayload = {
  goalId: string;
  slice: SliceValue;
  actorId: string;
  timestamp: number;
  knownVersion: number;
  idempotencyKey: string;
};

export class ChangeGoalSlice
  extends BaseCommand<ChangeGoalSlicePayload>
  implements Readonly<ChangeGoalSlicePayload>
{
  readonly type = 'ChangeGoalSlice';
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly actorId: string;
  readonly timestamp: number;
  readonly knownVersion: number;
  readonly idempotencyKey: string;

  constructor(payload: ChangeGoalSlicePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.actorId = payload.actorId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
    this.idempotencyKey = payload.idempotencyKey;
  }
}
