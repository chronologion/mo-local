import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type CreateScopePayload = {
  scopeId: string;
  ownerUserId: string;
  timestamp: number;
};

export class CreateScope extends BaseCommand<CreateScopePayload> implements Readonly<CreateScopePayload> {
  readonly scopeId: string;
  readonly ownerUserId: string;
  readonly timestamp: number;

  constructor(payload: CreateScopePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.scopeId = payload.scopeId;
    this.ownerUserId = payload.ownerUserId;
    this.timestamp = payload.timestamp;
  }
}
