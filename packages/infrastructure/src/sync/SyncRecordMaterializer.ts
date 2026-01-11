import type { MaterializedEventRow, SyncRecordMaterializerPort } from '@mo/sync-engine';
import { decodeRecordPayload, parseRecordJson } from '@mo/sync-engine';
import type { CryptoServicePort } from '@mo/application';
import { buildEventAad } from '../eventing/aad';
import { decodeEventEnvelope } from '../eventing/eventEnvelope';
import { KeyringManager } from '../crypto/KeyringManager';

export class SyncRecordMaterializer implements SyncRecordMaterializerPort {
  constructor(
    private readonly crypto: CryptoServicePort,
    private readonly keyringManager: KeyringManager
  ) {}

  async materializeRemoteEvent(input: {
    eventId: string;
    recordJson: string;
    globalSequence: number;
  }): Promise<{ eventRow: MaterializedEventRow }> {
    const { eventId, recordJson } = input;
    const record = parseRecordJson(recordJson);
    const payloadCiphertext = decodeRecordPayload(record);

    // TODO: Integrate VerificationPipeline here
    // 1. Verify signature over CBOR manifest
    // 2. Validate dependencies (scopeStateRef, grantId)
    // 3. Resolve K_scope from grant
    // 4. Unwrap K_resource from wrappedKey
    // 5. Decrypt with K_resource

    // Temporary: Use existing key resolution until verification integration complete
    const key = await this.keyringManager.resolveKeyForEpoch(record.aggregateId, 0);
    const aad = buildEventAad(record.aggregateType, record.aggregateId, record.version);
    const plaintext = await this.crypto.decrypt(payloadCiphertext, key, aad);
    const envelope = decodeEventEnvelope(plaintext);

    if (envelope.meta.eventId !== eventId) {
      throw new Error(`EventId mismatch for ${eventId}`);
    }

    // TODO(ALC-368): Integrate VerificationPipeline to verify signatures and resolve K_resource via grant_id
    const scopeStateRefBytes = record.scopeStateRef ? Buffer.from(record.scopeStateRef, 'base64url') : null;
    const signatureBytes = record.signature ? Buffer.from(record.signature, 'base64url') : null;

    return {
      eventRow: {
        id: eventId,
        aggregate_type: record.aggregateType,
        aggregate_id: record.aggregateId,
        event_type: envelope.meta.eventType,
        payload_encrypted: payloadCiphertext,
        version: record.version,
        occurred_at: envelope.meta.occurredAt,
        actor_id: envelope.meta.actorId,
        causation_id: envelope.meta.causationId,
        correlation_id: envelope.meta.correlationId,
        scope_id: record.scopeId,
        resource_id: record.resourceId,
        resource_key_id: record.resourceKeyId,
        grant_id: record.grantId,
        scope_state_ref: scopeStateRefBytes,
        author_device_id: record.authorDeviceId,
        sig_suite: record.sigSuite,
        signature: signatureBytes,
      },
    };
  }
}
