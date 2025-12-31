import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectNamePayload = {
  projectId: string;
  name: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectName
  extends BaseCommand<ChangeProjectNamePayload>
  implements Readonly<ChangeProjectNamePayload>
{
  readonly projectId: string;
  readonly name: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectNamePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.name = payload.name;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
