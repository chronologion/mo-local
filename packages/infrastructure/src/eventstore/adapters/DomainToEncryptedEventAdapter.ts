import { DomainEvent } from '@mo/domain';
import { EncryptedEvent, CryptoServicePort } from '@mo/application';
import { encodePayloadEnvelope } from '../../eventing/payloadEnvelope';
import { encodePersisted } from '../../eventing/registry';
import { buildEventAad } from '../../eventing/aad';

/**
 * Converts domain events to encrypted event records for persistence.
 *
 * NOTE ON EVENT VERSIONING
 *
 * Domain events (@mo/domain) are intentionally version-agnostic: they expose a
 * single canonical payload shape per event type and do NOT carry a payload-level
 * version. This keeps the domain model clean and focused on invariants.
 *
 * Payload versioning is handled exclusively at the persistence boundary, via
 * EncryptedEvent envelopes and the infra adapters. Any future upcasting or
 * downgrading between payload versions must happen in infra (here and in the
 * EncryptedEventToDomainAdapter) before constructing domain events, never inside the
 * domain layer itself.
 */
export class DomainToEncryptedEventAdapter {
  constructor(private readonly crypto: CryptoServicePort) {}

  async toEncrypted(
    domainEvent: DomainEvent,
    version: number,
    aggregateKey: Uint8Array,
    options?: { epoch?: number; keyringUpdate?: Uint8Array }
  ): Promise<EncryptedEvent> {
    const serialized = encodePersisted(domainEvent);
    const payloadBytes = encodePayloadEnvelope({
      payloadVersion: serialized.version,
      data: serialized.payload,
    });
    const aad = buildEventAad(
      domainEvent.aggregateId.value,
      domainEvent.eventType,
      version
    );

    let encryptedPayload: Uint8Array;
    try {
      encryptedPayload = await this.crypto.encrypt(
        payloadBytes,
        aggregateKey,
        aad
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown encryption error';
      throw new Error(
        `Failed to encrypt ${domainEvent.eventType} for ${domainEvent.aggregateId.value}: ${message}`
      );
    }

    return {
      id: domainEvent.eventId.value,
      aggregateId: domainEvent.aggregateId.value,
      eventType: domainEvent.eventType,
      payload: encryptedPayload,
      version,
      occurredAt: domainEvent.occurredAt.value,
      actorId: domainEvent.actorId.value,
      causationId: domainEvent.causationId?.value ?? null,
      correlationId: domainEvent.correlationId?.value ?? null,
      epoch: options?.epoch,
      keyringUpdate: options?.keyringUpdate,
      // sequence is assigned by the event store during append
    };
  }

  async toEncryptedBatch(
    domainEvents: DomainEvent[],
    startVersion: number,
    aggregateKey: Uint8Array
  ): Promise<EncryptedEvent[]> {
    return Promise.all(
      domainEvents.map((event, idx) =>
        this.toEncrypted(event, startVersion + idx, aggregateKey)
      )
    );
  }
}
