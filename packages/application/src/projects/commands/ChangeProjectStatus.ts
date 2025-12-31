import { ProjectStatusValue } from '@mo/domain';
import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectStatusPayload = {
  projectId: string;
  status: ProjectStatusValue;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectStatus
  extends BaseCommand<ChangeProjectStatusPayload>
  implements Readonly<ChangeProjectStatusPayload>
{
  readonly projectId: string;
  readonly status: ProjectStatusValue;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectStatusPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.status = payload.status;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
