import { Injectable } from '@nestjs/common';
import { SyncEvent, SyncEventAssignment, SyncIncomingEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { SyncEventRepository, SyncRepositoryHeadMismatchError } from './ports/sync-event-repository';
import { SyncAccessDeniedError, SyncAccessPolicy } from './ports/sync-access-policy';
import { SyncStoreRepository } from './ports/sync-store-repository';

export type SyncPushOk = Readonly<{
  ok: true;
  head: GlobalSequenceNumber;
  assigned: ReadonlyArray<SyncEventAssignment>;
}>;

export type SyncPushConflictReason = 'server_ahead' | 'server_behind';

export type SyncPushConflict = Readonly<{
  ok: false;
  head: GlobalSequenceNumber;
  reason: SyncPushConflictReason;
  missing?: ReadonlyArray<SyncEvent>;
}>;

export type SyncPushResult = SyncPushOk | SyncPushConflict;

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
    expectedHead: GlobalSequenceNumber;
    events: ReadonlyArray<SyncIncomingEvent>;
  }): Promise<SyncPushResult> {
    const { ownerId, storeId, events, expectedHead } = params;

    await this.accessPolicy.ensureCanPush(ownerId, storeId);
    await this.storeRepository.ensureStoreOwner(storeId, ownerId);

    if (events.length === 0) {
      const head = await this.repository.getHeadSequence(ownerId, storeId);
      return { ok: true, head, assigned: [] };
    }

    try {
      const result = await this.repository.appendBatch({
        ownerId,
        storeId,
        expectedHead,
        events,
      });
      return { ok: true, head: result.head, assigned: result.assigned };
    } catch (error) {
      if (error instanceof SyncRepositoryHeadMismatchError) {
        const isBehind = error.currentHead.unwrap() < error.expectedHead.unwrap();
        const missing = isBehind ? [] : await this.repository.loadSince(ownerId, storeId, expectedHead, 1_000);
        return {
          ok: false,
          head: error.currentHead,
          reason: isBehind ? 'server_behind' : 'server_ahead',
          missing: missing.length > 0 ? missing : undefined,
        };
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

  async resetStore(params: { ownerId: SyncOwnerId; storeId: SyncStoreId }): Promise<void> {
    const { ownerId, storeId } = params;
    if (process.env.NODE_ENV === 'production') {
      throw new SyncAccessDeniedError('Reset sync store is disabled in production');
    }
    await this.accessPolicy.ensureCanPush(ownerId, storeId);
    await this.storeRepository.ensureStoreOwner(storeId, ownerId);
    await this.repository.resetStore(ownerId, storeId);
  }

  private async loadEvents(params: {
    ownerId: SyncOwnerId;
    storeId: SyncStoreId;
    since: GlobalSequenceNumber;
    limit: number;
  }): Promise<{ events: SyncEvent[]; head: GlobalSequenceNumber }> {
    const { ownerId, storeId, since, limit } = params;
    const events = await this.repository.loadSince(ownerId, storeId, since, limit);
    const head = await this.repository.getHeadSequence(ownerId, storeId);
    return { events, head };
  }
}
