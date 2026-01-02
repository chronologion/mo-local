import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type ChangeProjectDescriptionPayload = {
  projectId: string;
  description: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectDescription
  extends BaseCommand<ChangeProjectDescriptionPayload>
  implements Readonly<ChangeProjectDescriptionPayload>
{
  readonly projectId: string;
  readonly description: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectDescriptionPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.description = payload.description;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
