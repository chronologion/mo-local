import { Injectable } from '@nestjs/common';
import { LiveStoreEvent } from '@livestore/common/schema';
import { SyncEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import {
  SyncEventRepository,
  SyncRepositoryConflictError,
  SyncRepositoryHeadMismatchError,
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

    const first = events[0];
    if (!first) {
      const head = await this.repository.getHeadSequence(ownerId, storeId);
      return { lastSeqNum: head };
    }
    const firstSeqNum = first.seqNum;
    const firstParentSeqNum = first.parentSeqNum;

    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const curr = events[i];
      if (curr.seqNum !== prev.seqNum + 1) {
        throw new PushValidationError('Sequence numbers must be contiguous', {
          minimumExpectedSeqNum: prev.seqNum + 1,
          providedSeqNum: curr.seqNum,
        });
      }
      if (curr.parentSeqNum !== prev.seqNum) {
        throw new PushValidationError('parentSeqNum must match prior seqNum', {
          minimumExpectedSeqNum: prev.seqNum,
          providedSeqNum: curr.parentSeqNum,
        });
      }
    }

    if (firstParentSeqNum >= firstSeqNum) {
      throw new PushValidationError('parentSeqNum must precede seqNum', {
        minimumExpectedSeqNum: Math.max(firstSeqNum - 1, 0),
        providedSeqNum: firstParentSeqNum,
      });
    }

    if (firstSeqNum !== firstParentSeqNum + 1) {
      throw new PushValidationError('Sequence numbers must be contiguous', {
        minimumExpectedSeqNum: firstParentSeqNum + 1,
        providedSeqNum: firstSeqNum,
      });
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
      const newHead = await this.repository.appendBatch(
        assigned,
        GlobalSequenceNumber.from(firstParentSeqNum)
      );
      return { lastSeqNum: newHead };
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
      if (error instanceof SyncRepositoryHeadMismatchError) {
        throw new PushValidationError(
          'Server ahead of client',
          {
            minimumExpectedSeqNum: error.expectedHead.unwrap(),
            providedSeqNum: error.providedParent.unwrap(),
          },
          error
        );
      }
      if (error instanceof SyncAccessDeniedError) {
        throw error;
      }
      throw error;
    }
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
    return this.loadEvents({ ownerId, storeId, since, limit });
  }

  async pullEventsWithWait(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    since: GlobalSequenceNumber;
    limit: number;
    waitMs: number;
    pollIntervalMs: number;
  }): Promise<{ events: SyncEvent[]; head: GlobalSequenceNumber }> {
    const { ownerId, storeId, since, limit, waitMs, pollIntervalMs } = params;
    await this.accessPolicy.ensureCanPull(ownerId, storeId);
    await this.storeRepository.ensureStoreOwner(storeId, ownerId);

    const clampedWaitMs = Math.max(0, waitMs);
    const deadline = Date.now() + clampedWaitMs;
    const interval = Math.max(50, pollIntervalMs);

    while (true) {
      const result = await this.loadEvents({ ownerId, storeId, since, limit });
      if (result.events.length > 0 || clampedWaitMs === 0) {
        return result;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return result;
      }
      await delay(Math.min(interval, remaining));
    }
  }

  private async loadEvents(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    since: GlobalSequenceNumber;
    limit: number;
  }): Promise<{ events: SyncEvent[]; head: GlobalSequenceNumber }> {
    const { ownerId, storeId, since, limit } = params;
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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
