import { BaseCommand } from '../../shared/ports/BaseCommand';

export type ChangeProjectDatesPayload = {
  projectId: string;
  startDate: string;
  targetDate: string;
  userId: string;
  timestamp: number;
  knownVersion: number;
};

export class ChangeProjectDates
  extends BaseCommand<ChangeProjectDatesPayload>
  implements Readonly<ChangeProjectDatesPayload>
{
  readonly type = 'ChangeProjectDates';
  readonly projectId: string;
  readonly startDate: string;
  readonly targetDate: string;
  readonly userId: string;
  readonly timestamp: number;
  readonly knownVersion: number;

  constructor(payload: ChangeProjectDatesPayload) {
    super(payload);
    this.projectId = payload.projectId;
    this.startDate = payload.startDate;
    this.targetDate = payload.targetDate;
    this.userId = payload.userId;
    this.timestamp = payload.timestamp;
    this.knownVersion = payload.knownVersion;
  }
}
