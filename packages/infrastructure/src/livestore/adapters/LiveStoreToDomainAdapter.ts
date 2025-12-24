import { ActorId, CorrelationId, DomainEvent, EventId } from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { buildEventAad } from '../../eventing/aad';
import { decodePayloadEnvelope } from '../../eventing/payloadEnvelope';
import { decodePersisted } from '../../eventing/registry';

/**
 * Converts encrypted LiveStore events into domain events.
 * Delegates all event-shape/version logic to the per-BC codecs.
 */
export class LiveStoreToDomainAdapter {
  constructor(private readonly crypto: ICryptoService) {}

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
    return decodePersisted(
      {
        type: lsEvent.eventType,
        version: payloadVersion,
        payload: data,
      },
      {
        eventId: EventId.from(lsEvent.id),
        actorId: lsEvent.actorId ? ActorId.from(lsEvent.actorId) : undefined,
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
