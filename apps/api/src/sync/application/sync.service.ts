import { Injectable } from '@nestjs/common';
import { LiveStoreEvent } from '@livestore/common/schema';
import { SyncEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
} from './ports/sync-event-repository';
import { SyncAccessPolicy } from './ports/sync-access-policy';

export class PushValidationError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PushValidationError';
  }
}

@Injectable()
export class SyncService {
  constructor(
    private readonly repository: SyncEventRepository,
    private readonly accessPolicy: SyncAccessPolicy
  ) {}

  async pushEvents(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    events: LiveStoreEvent.Global.Encoded[];
  }): Promise<{ lastSeqNum: GlobalSequenceNumber }> {
    const { ownerId, storeId, events } = params;

    await this.accessPolicy.ensureCanPush(ownerId, storeId);

    if (events.length === 0) {
      const head = await this.repository.getHeadSequence(ownerId, storeId);
      return { lastSeqNum: head };
    }

    const currentHead = await this.repository.getHeadSequence(ownerId, storeId);

    const ordered = [...events];
    const assigned: SyncEvent[] = ordered.map((event, index) => {
      const seqValue = currentHead.unwrap() + index + 1;
      const parentValue = index === 0 ? currentHead.unwrap() : seqValue - 1;
      return {
        ownerId,
        storeId,
        seqNum: GlobalSequenceNumber.from(seqValue),
        parentSeqNum: GlobalSequenceNumber.from(parentValue),
        name: event.name,
        args: event.args,
        clientId: event.clientId,
        sessionId: event.sessionId,
        createdAt: new Date(),
      };
    });

    try {
      await this.repository.appendBatch(assigned);
    } catch (error) {
      if (error instanceof SyncRepositoryConflictError) {
        throw new PushValidationError(
          'Duplicate sequence number detected',
          error
        );
      }
      throw error;
    }

    return { lastSeqNum: assigned[assigned.length - 1]?.seqNum ?? currentHead };
  }

  async pullEvents(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    since: GlobalSequenceNumber;
    limit: number;
  }): Promise<{ events: SyncEvent[]; head: GlobalSequenceNumber }> {
    const { ownerId, storeId, since, limit } = params;
    await this.accessPolicy.ensureCanPull(ownerId, storeId);
    const events = await this.repository.loadSince(
      ownerId,
      storeId,
      since,
      limit
    );
    const head =
      events.length > 0
        ? (events[events.length - 1]?.seqNum ?? since)
        : await this.repository.getHeadSequence(ownerId, storeId);
    return { events, head };
  }
}
