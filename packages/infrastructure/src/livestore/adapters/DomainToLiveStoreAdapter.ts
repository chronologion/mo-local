import { DomainEvent } from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { uuidv7 } from '@mo/domain/src/utils/uuid';

/**
 * Converts domain events to encrypted LiveStore events.
 */
export class DomainToLiveStoreAdapter {
  constructor(private readonly crypto: ICryptoService) {}

  async toEncrypted(
    domainEvent: DomainEvent,
    version: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent> {
    const payloadJson = JSON.stringify((domainEvent as any).payload ?? {});
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const encryptedPayload = await this.crypto.encrypt(payloadBytes, kGoal);

    return {
      id: uuidv7(),
      aggregateId: domainEvent.aggregateId,
      eventType: domainEvent.eventType,
      payload: encryptedPayload,
      version,
      occurredAt: domainEvent.occurredAt.getTime(),
      sequence: 0,
    };
  }

  async toEncryptedBatch(
    domainEvents: DomainEvent[],
    startVersion: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent[]> {
    return Promise.all(
      domainEvents.map((event, idx) => this.toEncrypted(event, startVersion + idx, kGoal))
    );
  }
}
