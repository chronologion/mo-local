import { ProjectStatusValue } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type CreateProjectPayload = {
  projectId: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description?: string;
  goalId?: string | null;
  timestamp: number;
};

export class CreateProject
  extends BaseCommand<CreateProjectPayload>
  implements Readonly<CreateProjectPayload>
{
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatusValue;
  readonly startDate: string;
  readonly targetDate: string;
  readonly description?: string;
  readonly goalId?: string | null;
  readonly timestamp: number;

  constructor(payload: CreateProjectPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.status = payload.status;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.description = payload.description;
    this.goalId = payload.goalId;
    this.timestamp = payload.timestamp;
  }
}
