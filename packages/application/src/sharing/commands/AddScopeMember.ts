import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type AddScopeMemberPayload = {
  scopeId: string;
  memberId: string;
  role: string;
  timestamp: number;
};

export class AddScopeMember extends BaseCommand<AddScopeMemberPayload> implements Readonly<AddScopeMemberPayload> {
  readonly scopeId: string;
  readonly memberId: string;
  readonly role: string;
  readonly timestamp: number;

  constructor(payload: AddScopeMemberPayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.scopeId = payload.scopeId;
    this.memberId = payload.memberId;
    this.role = payload.role;
    this.timestamp = payload.timestamp;
  }
}
