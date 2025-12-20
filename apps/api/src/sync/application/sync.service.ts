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
import {
  SyncAccessDeniedError,
  SyncAccessPolicy,
} from './ports/sync-access-policy';
import { SyncStoreRepository } from './ports/sync-store-repository';

export class PushValidationError extends Error {
  constructor(
    message: string,
    readonly details?: {
      minimumExpectedSeqNum?: number;
      providedSeqNum?: number;
    },
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
    private readonly storeRepository: SyncStoreRepository,
    private readonly accessPolicy: SyncAccessPolicy
  ) {}

  async pushEvents(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    events: LiveStoreEvent.Global.Encoded[];
  }): Promise<{ lastSeqNum: GlobalSequenceNumber }> {
    const { ownerId, storeId, events } = params;

    await this.accessPolicy.ensureCanPush(ownerId, storeId);
    await this.storeRepository.ensureStoreOwner(storeId, ownerId);

    if (events.length === 0) {
      const head = await this.repository.getHeadSequence(ownerId, storeId);
      return { lastSeqNum: head };
    }

    const currentHead = await this.repository.getHeadSequence(ownerId, storeId);
    const firstSeqNum = events[0]?.seqNum;

    if (firstSeqNum <= currentHead.unwrap()) {
      throw new PushValidationError('Server ahead of client', {
        minimumExpectedSeqNum: currentHead.unwrap() + 1,
        providedSeqNum: firstSeqNum,
      });
    }

    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const curr = events[i];
      if (curr.seqNum <= prev.seqNum) {
        throw new PushValidationError(
          'Sequence numbers must be strictly increasing',
          {
            minimumExpectedSeqNum: prev.seqNum + 1,
            providedSeqNum: curr.seqNum,
          }
        );
      }
      if (curr.parentSeqNum >= curr.seqNum) {
        throw new PushValidationError('parentSeqNum must precede seqNum', {
          minimumExpectedSeqNum: curr.seqNum,
          providedSeqNum: curr.parentSeqNum,
        });
      }
    }

    const assigned: SyncEvent[] = events.map((event) => {
      return {
        ownerId,
        storeId,
        seqNum: GlobalSequenceNumber.from(event.seqNum),
        parentSeqNum: GlobalSequenceNumber.from(event.parentSeqNum),
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
        const latestHead = await this.repository.getHeadSequence(
          ownerId,
          storeId
        );
        throw new PushValidationError(
          'Duplicate sequence number detected',
          {
            minimumExpectedSeqNum: latestHead.unwrap() + 1,
            providedSeqNum: firstSeqNum,
          },
          error
        );
      }
      if (error instanceof SyncAccessDeniedError) {
        throw error;
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
    await this.storeRepository.ensureStoreOwner(storeId, ownerId);
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
