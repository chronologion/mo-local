import {
  BaseCommand,
  type CommandMetadata,
} from '../../shared/ports/BaseCommand';

export type ChangeProjectDatesPayload = {
  projectId: string;
  startDate: string;
  targetDate: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectDates
  extends BaseCommand<ChangeProjectDatesPayload>
  implements Readonly<ChangeProjectDatesPayload>
{
  readonly projectId: string;
  readonly startDate: string;
  readonly targetDate: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectDatesPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.projectId = payload.projectId;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
