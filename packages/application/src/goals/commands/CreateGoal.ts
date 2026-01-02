import { PriorityLevel, SliceValue } from '@mo/domain';
import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type CreateGoalPayload = {
  goalId: string;
  slice: SliceValue;
  summary: string;
  targetMonth: string;
  priority: PriorityLevel;
  timestamp: number;
};

export class CreateGoal extends BaseCommand<CreateGoalPayload> implements Readonly<CreateGoalPayload> {
  readonly goalId: string;
  readonly slice: SliceValue;
  readonly summary: string;
  readonly targetMonth: string;
  readonly priority: PriorityLevel;
  readonly timestamp: number;

  constructor(payload: CreateGoalPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.slice = payload.slice;
    this.summary = payload.summary;
    this.targetMonth = payload.targetMonth;
    this.priority = payload.priority;
    this.timestamp = payload.timestamp;
  }
}
