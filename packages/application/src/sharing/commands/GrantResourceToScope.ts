import { BaseCommand, type CommandMetadata } from '../../shared/ports/BaseCommand';

export type GrantResourceToScopePayload = {
  grantId: string;
  scopeId: string;
  resourceId: string;
  resourceKeyId: string;
  scopeEpoch: string; // bigint as string
  wrappedKeyBase64: string;
  timestamp: number;
};

export class GrantResourceToScope
  extends BaseCommand<GrantResourceToScopePayload>
  implements Readonly<GrantResourceToScopePayload>
{
  readonly grantId: string;
  readonly scopeId: string;
  readonly resourceId: string;
  readonly resourceKeyId: string;
  readonly scopeEpoch: string;
  readonly wrappedKeyBase64: string;
  readonly timestamp: number;

  constructor(payload: GrantResourceToScopePayload, meta?: CommandMetadata) {
    super(payload, meta);
    this.grantId = payload.grantId;
    this.scopeId = payload.scopeId;
    this.resourceId = payload.resourceId;
    this.resourceKeyId = payload.resourceKeyId;
    this.scopeEpoch = payload.scopeEpoch;
    this.wrappedKeyBase64 = payload.wrappedKeyBase64;
    this.timestamp = payload.timestamp;
  }
}
