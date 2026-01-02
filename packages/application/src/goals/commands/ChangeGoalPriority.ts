import { PriorityLevel } from '@mo/domain';
import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type ChangeGoalPriorityPayload = {
  goalId: string;
  priority: PriorityLevel;
  timestamp: number;
  knownVersion: number;
};

export class ChangeGoalPriority
  extends BaseCommand<ChangeGoalPriorityPayload>
  implements Readonly<ChangeGoalPriorityPayload>
{
  readonly goalId: string;
  readonly priority: PriorityLevel;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeGoalPriorityPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.goalId = payload.goalId;
    this.priority = payload.priority;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
