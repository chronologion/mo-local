import { DomainEvent, goalEventTypes, projectEventTypes } from '@mo/domain';
import { EncryptedEvent, ICryptoService } from '@mo/application';
import { GoalEventCodec } from '../../goals/GoalEventCodec';
import { ProjectEventCodec } from '../../projects/ProjectEventCodec';

const goalEventNames = new Set(Object.values(goalEventTypes) as string[]);
const projectEventNames = new Set(Object.values(projectEventTypes) as string[]);

type PayloadWrapper = {
  payloadVersion: number;
  data: unknown;
};

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
    const aad = new TextEncoder().encode(
      `${lsEvent.aggregateId}:${lsEvent.eventType}:${lsEvent.version}`
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

    let wrapper: PayloadWrapper | unknown;
    try {
      wrapper = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid JSON payload';
      throw new Error(`Malformed payload for ${lsEvent.eventType}: ${message}`);
    }

    // Backward/legacy handling: if payloadVersion is missing, assume v1 and raw data.
    const payloadVersion =
      typeof (wrapper as PayloadWrapper).payloadVersion === 'number'
        ? (wrapper as PayloadWrapper).payloadVersion
        : 1;
    const data =
      (wrapper as PayloadWrapper).data !== undefined
        ? (wrapper as PayloadWrapper).data
        : wrapper;

    if (goalEventNames.has(lsEvent.eventType)) {
      return GoalEventCodec.deserialize(
        lsEvent.eventType as (typeof goalEventTypes)[keyof typeof goalEventTypes],
        payloadVersion,
        data
      );
    }

    if (projectEventNames.has(lsEvent.eventType)) {
      return ProjectEventCodec.deserialize(
        lsEvent.eventType as (typeof projectEventTypes)[keyof typeof projectEventTypes],
        payloadVersion,
        data
      );
    }

    throw new Error(`Unsupported event type: ${lsEvent.eventType}`);
  }

  async toDomainBatch(
    events: EncryptedEvent[],
    key: Uint8Array
  ): Promise<DomainEvent[]> {
    return Promise.all(events.map((event) => this.toDomain(event, key)));
  }
}
