import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type ArchiveProjectPayload = {
  projectId: string;
  timestamp: number;
  knownVersion: number;
};

export class ArchiveProject extends BaseCommand<ArchiveProjectPayload> implements Readonly<ArchiveProjectPayload> {
  readonly projectId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ArchiveProjectPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
