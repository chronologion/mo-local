import {
  DomainEvent,
  uuidv7,
  goalEventTypes,
  projectEventTypes,
} from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { GoalEventCodec } from '../../goals/GoalEventCodec';
import { ProjectEventCodec } from '../../projects/ProjectEventCodec';

const goalEventNames = new Set(Object.values(goalEventTypes) as string[]);
const projectEventNames = new Set(Object.values(projectEventTypes) as string[]);

/**
 * Converts domain events to encrypted LiveStore events.
 *
 * NOTE ON EVENT VERSIONING
 *
 * Domain events (@mo/domain) are intentionally version-agnostic: they expose a
 * single canonical payload shape per event type and do NOT carry a payload-level
 * version. This keeps the domain model clean and focused on invariants.
 *
 * Payload versioning is handled exclusively at the persistence boundary, via
 * EncryptedEvent envelopes and the LiveStore adapters. Any future upcasting or
 * downgrading between payload versions must happen in infra (here and in the
 * LiveStoreToDomainAdapter) before constructing domain events, never inside the
 * domain layer itself.
 */
export class DomainToLiveStoreAdapter {
  constructor(private readonly crypto: ICryptoService) {}

  async toEncrypted(
    domainEvent: DomainEvent,
    version: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent> {
    const serialized = this.serialize(domainEvent, version);
    const payloadJson = JSON.stringify({
      payloadVersion: serialized.payloadVersion,
      data: serialized.payload,
    });
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const aad = new TextEncoder().encode(
      `${serialized.aggregateId}:${serialized.eventType}:${version}`
    );

    let encryptedPayload: Uint8Array;
    try {
      encryptedPayload = await this.crypto.encrypt(payloadBytes, kGoal, aad);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown encryption error';
      throw new Error(
        `Failed to encrypt ${domainEvent.eventType} for ${domainEvent.aggregateId.value}: ${message}`
      );
    }

    return {
      id: uuidv7(),
      aggregateId: serialized.aggregateId,
      eventType: serialized.eventType,
      payload: encryptedPayload,
      version,
      occurredAt: serialized.occurredAt,
      // sequence is assigned by the event store during append
    };
  }

  async toEncryptedBatch(
    domainEvents: DomainEvent[],
    startVersion: number,
    kGoal: Uint8Array
  ): Promise<EncryptedEvent[]> {
    return Promise.all(
      domainEvents.map((event, idx) =>
        this.toEncrypted(event, startVersion + idx, kGoal)
      )
    );
  }

  private serialize(domainEvent: DomainEvent, streamVersion: number) {
    if (goalEventNames.has(domainEvent.eventType)) {
      return GoalEventCodec.serialize(domainEvent as never, streamVersion);
    }
    if (projectEventNames.has(domainEvent.eventType)) {
      return ProjectEventCodec.serialize(domainEvent as never, streamVersion);
    }
    throw new Error(`Unsupported domain event type: ${domainEvent.eventType}`);
  }
}
