import { ActorId, CorrelationId, DomainEvent, EventId } from '@mo/domain';
import { EncryptedEvent, CryptoServicePort } from '@mo/application';
import { buildEventAad } from '../../eventing/aad';
import { decodePayloadEnvelope } from '../../eventing/payloadEnvelope';
import { decodePersisted } from '../../eventing/registry';

/**
 * Converts encrypted events into domain events.
 * Delegates event-shape/version logic to per-BC codecs.
 */
export class EncryptedEventToDomainAdapter {
  constructor(private readonly crypto: CryptoServicePort) {}

  async toDomain(
    encryptedEvent: EncryptedEvent,
    aggregateKey: Uint8Array
  ): Promise<DomainEvent> {
    const aad = buildEventAad(
      encryptedEvent.aggregateId,
      encryptedEvent.eventType,
      encryptedEvent.version
    );
    let payloadBytes: Uint8Array;
    try {
      payloadBytes = await this.crypto.decrypt(
        encryptedEvent.payload,
        aggregateKey,
        aad
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      throw new Error(
        `Failed to decrypt ${encryptedEvent.eventType} for ${encryptedEvent.aggregateId}: ${message}`
      );
    }

    const { payloadVersion, data } = decodePayloadEnvelope(payloadBytes);
    if (!encryptedEvent.actorId) {
      throw new Error(
        `Missing actorId for ${encryptedEvent.eventType} ${encryptedEvent.id}`
      );
    }
    return decodePersisted(
      {
        type: encryptedEvent.eventType,
        version: payloadVersion,
        payload: data,
      },
      {
        eventId: EventId.from(encryptedEvent.id),
        actorId: ActorId.from(encryptedEvent.actorId),
        causationId: encryptedEvent.causationId
          ? EventId.from(encryptedEvent.causationId)
          : undefined,
        correlationId: encryptedEvent.correlationId
          ? CorrelationId.from(encryptedEvent.correlationId)
          : undefined,
      }
    );
  }

  async toDomainBatch(
    events: EncryptedEvent[],
    aggregateKey: Uint8Array
  ): Promise<DomainEvent[]> {
    return Promise.all(
      events.map((event) => this.toDomain(event, aggregateKey))
    );
  }
}
