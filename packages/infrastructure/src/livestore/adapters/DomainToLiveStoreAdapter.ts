import { DomainEvent, uuidv7 } from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';

/**
 * Converts domain events to encrypted LiveStore events.
 */
export class DomainToLiveStoreAdapter {
  constructor(private readonly crypto: ICryptoService) {}

  async toEncrypted(
    domainEvent: SerializableDomainEvent,
    version: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent> {
    const payloadJson = JSON.stringify(domainEvent.payload ?? {});
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const aad = new TextEncoder().encode(
      `${domainEvent.aggregateId}:${domainEvent.eventType}:${version}`
    );

    let encryptedPayload: Uint8Array;
    try {
      encryptedPayload = await this.crypto.encrypt(payloadBytes, kGoal, aad);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown encryption error';
      throw new Error(
        `Failed to encrypt ${domainEvent.eventType} for ${domainEvent.aggregateId}: ${message}`
      );
    }

    return {
      id: uuidv7(),
      aggregateId: domainEvent.aggregateId,
      eventType: domainEvent.eventType,
      payload: encryptedPayload,
      version,
      occurredAt: domainEvent.occurredAt.getTime(),
      // sequence is assigned by the event store during append
    };
  }

  async toEncryptedBatch(
    domainEvents: SerializableDomainEvent[],
    startVersion: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent[]> {
    return Promise.all(
      domainEvents.map((event, idx) =>
        this.toEncrypted(event, startVersion + idx, kGoal)
      )
    );
  }
}

type SerializableDomainEvent = DomainEvent & {
  payload: Record<string, unknown>;
};
