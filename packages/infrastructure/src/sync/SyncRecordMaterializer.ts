import type { MaterializedEventRow, SyncRecordMaterializerPort } from '@mo/sync-engine';
import { decodeRecordKeyringUpdate, decodeRecordPayload, parseRecordJson } from '@mo/sync-engine';
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
    const keyringUpdate = decodeRecordKeyringUpdate(record);

    if (keyringUpdate) {
      await this.keyringManager.ingestKeyringUpdate(record.aggregateId, keyringUpdate);
    }

    const key = await this.keyringManager.resolveKeyForEpoch(record.aggregateId, record.epoch);
    const aad = buildEventAad(record.aggregateType, record.aggregateId, record.version);
    const plaintext = await this.crypto.decrypt(payloadCiphertext, key, aad);
    const envelope = decodeEventEnvelope(plaintext);

    if (envelope.meta.eventId !== eventId) {
      throw new Error(`EventId mismatch for ${eventId}`);
    }

    return {
      eventRow: {
        id: eventId,
        aggregate_type: record.aggregateType,
        aggregate_id: record.aggregateId,
        event_type: envelope.meta.eventType,
        // Persist the original ciphertext bytes (no re-encryption on pull).
        payload_encrypted: payloadCiphertext,
        keyring_update: keyringUpdate,
        version: record.version,
        occurred_at: envelope.meta.occurredAt,
        actor_id: envelope.meta.actorId,
        causation_id: envelope.meta.causationId,
        correlation_id: envelope.meta.correlationId,
        epoch: record.epoch,
      },
    };
  }
}
