import {
  ActorId,
  CorrelationId,
  DomainEvent,
  EventId,
  GoalId,
  ProjectId,
  Timestamp,
  UserId,
  goalEventTypes,
  identityEventTypes,
  projectEventTypes,
} from '@mo/domain';
import { EncryptedEvent, CryptoServicePort } from '@mo/application';
import { buildEventAad } from '../../eventing/aad';
import { decodeEventEnvelope } from '../../eventing/eventEnvelope';
import { decodePersisted } from '../../eventing/registry';

/**
 * Converts encrypted events into domain events.
 * Delegates event-shape/version logic to per-BC codecs.
 */
export class EncryptedEventToDomainAdapter {
  constructor(private readonly crypto: CryptoServicePort) {}

  private static readonly aggregateIdResolvers = (() => {
    const map = new Map<string, (id: string) => GoalId | ProjectId | UserId>();
    for (const type of Object.values(goalEventTypes)) {
      map.set(type, (id) => GoalId.from(id));
    }
    for (const type of Object.values(projectEventTypes)) {
      map.set(type, (id) => ProjectId.from(id));
    }
    map.set(identityEventTypes.userRegistered, (id) => UserId.from(id));
    return map;
  })();

  private resolveAggregateId(eventType: string, aggregateId: string) {
    const resolver = EncryptedEventToDomainAdapter.aggregateIdResolvers.get(eventType);
    if (!resolver) {
      throw new Error(`Unknown aggregate type for event ${eventType}`);
    }
    return resolver(aggregateId);
  }

  async toDomain(encryptedEvent: EncryptedEvent, aggregateKey: Uint8Array): Promise<DomainEvent> {
    if (!encryptedEvent.aggregateType) {
      throw new Error(`Missing aggregateType for event ${encryptedEvent.id}`);
    }
    const aad = buildEventAad(encryptedEvent.aggregateType, encryptedEvent.aggregateId, encryptedEvent.version);
    let payloadBytes: Uint8Array;
    try {
      payloadBytes = await this.crypto.decrypt(encryptedEvent.payload, aggregateKey, aad);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown decryption error';
      throw new Error(`Failed to decrypt ${encryptedEvent.eventType} for ${encryptedEvent.aggregateId}: ${message}`);
    }

    const { payloadVersion, data, meta } = decodeEventEnvelope(payloadBytes);
    if (meta.eventId !== encryptedEvent.id) {
      throw new Error(`EventId mismatch for ${encryptedEvent.id}`);
    }
    if (meta.eventType !== encryptedEvent.eventType) {
      throw new Error(`EventType mismatch for ${encryptedEvent.id}`);
    }
    if (!meta.actorId) {
      throw new Error(`Missing actorId for ${encryptedEvent.eventType} ${encryptedEvent.id}`);
    }
    if (meta.occurredAt !== encryptedEvent.occurredAt) {
      throw new Error(`OccurredAt mismatch for ${encryptedEvent.id}`);
    }
    if ((meta.causationId ?? null) !== (encryptedEvent.causationId ?? null)) {
      throw new Error(`CausationId mismatch for ${encryptedEvent.id}`);
    }
    if ((meta.correlationId ?? null) !== (encryptedEvent.correlationId ?? null)) {
      throw new Error(`CorrelationId mismatch for ${encryptedEvent.id}`);
    }
    return decodePersisted(
      {
        type: meta.eventType,
        version: payloadVersion,
        payload: data,
      },
      {
        aggregateId: this.resolveAggregateId(meta.eventType, encryptedEvent.aggregateId),
        occurredAt: Timestamp.fromMillis(meta.occurredAt),
        eventId: EventId.from(meta.eventId),
        actorId: ActorId.from(meta.actorId),
        causationId: meta.causationId ? EventId.from(meta.causationId) : undefined,
        correlationId: meta.correlationId ? CorrelationId.from(meta.correlationId) : undefined,
        version: encryptedEvent.version ?? undefined,
      }
    );
  }

  async toDomainBatch(events: EncryptedEvent[], aggregateKey: Uint8Array): Promise<DomainEvent[]> {
    return Promise.all(events.map((event) => this.toDomain(event, aggregateKey)));
  }
}
