import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeProjectNamePayload = {
  projectId: string;
  name: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectName
  extends BaseCommand<ChangeProjectNamePayload>
  implements Readonly<ChangeProjectNamePayload>
{
  readonly type = 'ChangeProjectName';
  readonly projectId: string;
  readonly name: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectNamePayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
