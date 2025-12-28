import { ActorId, CorrelationId, DomainEvent, EventId } from '@mo/domain';
import { EncryptedEvent, CryptoServicePort } from '@mo/application';
import { buildEventAad } from '../../eventing/aad';
import { decodePayloadEnvelope } from '../../eventing/payloadEnvelope';
import { decodePersisted } from '../../eventing/registry';

/**
 * Converts encrypted LiveStore events into domain events.
 * Delegates all event-shape/version logic to the per-BC codecs.
 */
export class LiveStoreToDomainAdapter {
  constructor(private readonly crypto: CryptoServicePort) {}

  async toDomain(
    lsEvent: EncryptedEvent,
    key: Uint8Array
  ): Promise<DomainEvent> {
    const aad = buildEventAad(
      lsEvent.aggregateId,
      lsEvent.eventType,
      lsEvent.version
    );
    let payloadBytes: Uint8Array;
    try {
      payloadBytes = await this.crypto.decrypt(lsEvent.payload, key, aad);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown decryption error';
      throw new Error(
        `Failed to decrypt ${lsEvent.eventType} for ${lsEvent.aggregateId}: ${message}`
      );
    }

    const { payloadVersion, data } = decodePayloadEnvelope(payloadBytes);
    if (!lsEvent.actorId) {
      throw new Error(`Missing actorId for ${lsEvent.eventType} ${lsEvent.id}`);
    }
    return decodePersisted(
      {
        type: lsEvent.eventType,
        version: payloadVersion,
        payload: data,
      },
      {
        eventId: EventId.from(lsEvent.id),
        actorId: ActorId.from(lsEvent.actorId),
        causationId: lsEvent.causationId
          ? EventId.from(lsEvent.causationId)
          : undefined,
        correlationId: lsEvent.correlationId
          ? CorrelationId.from(lsEvent.correlationId)
          : undefined,
      }
    );
  }

  async toDomainBatch(
    events: EncryptedEvent[],
    key: Uint8Array
  ): Promise<DomainEvent[]> {
    return Promise.all(events.map((event) => this.toDomain(event, key)));
  }
}
