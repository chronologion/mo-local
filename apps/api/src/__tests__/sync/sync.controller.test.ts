import { describe, expect, it } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import { SyncController } from '../../sync/presentation/sync.controller';
import {
  PushValidationError,
  SyncService,
} from '../../sync/application/sync.service';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { SyncAccessDeniedError } from '../../sync/application/ports/sync-access-policy';
import { SyncAccessPolicy } from '../../sync/application/ports/sync-access-policy';
import { SyncEventRepository } from '../../sync/application/ports/sync-event-repository';
import { SyncStoreRepository } from '../../sync/application/ports/sync-store-repository';
import type { AuthenticatedIdentity } from '../../access/application/authenticated-identity';

type PushEventDto = {
  name: string;
  args: unknown;
  seqNum: number;
  parentSeqNum: number;
  clientId: string;
  sessionId: string;
};

type PushEventsDto = {
  storeId: string;
  events: PushEventDto[];
};

type PullEventsDto = {
  storeId: string;
  since?: number;
  limit?: number;
  waitMs?: number;
};

const makeIdentity = (id = 'owner-1'): AuthenticatedIdentity => ({
  id,
  traits: {},
});

class DummySyncEventRepository extends SyncEventRepository {
  override async getHeadSequence(): Promise<GlobalSequenceNumber> {
    return GlobalSequenceNumber.from(0);
  }

  override async appendBatch(): Promise<GlobalSequenceNumber> {
    return GlobalSequenceNumber.from(0);
  }

  override async loadSince(): Promise<[]> {
    return [];
  }
}

class DummySyncStoreRepository extends SyncStoreRepository {
  override async ensureStoreOwner(): Promise<void> {}
}

class DummySyncAccessPolicy extends SyncAccessPolicy {
  override async ensureCanPush(): Promise<void> {}
  override async ensureCanPull(): Promise<void> {}
}

class TestSyncService extends SyncService {
  constructor(
    private readonly pushImpl?: SyncService['pushEvents'],
    private readonly pullImpl?: SyncService['pullEventsWithWait']
  ) {
    super(
      new DummySyncEventRepository(),
      new DummySyncStoreRepository(),
      new DummySyncAccessPolicy()
    );
  }

  override async pushEvents(params: Parameters<SyncService['pushEvents']>[0]) {
    if (this.pushImpl) {
      return this.pushImpl(params);
    }
    return super.pushEvents(params);
  }

  override async pullEventsWithWait(
    params: Parameters<SyncService['pullEventsWithWait']>[0]
  ) {
    if (this.pullImpl) {
      return this.pullImpl(params);
    }
    return super.pullEventsWithWait(params);
  }
}

describe('SyncController', () => {
  it('pushes events and returns last sequence', async () => {
    const captured: {
      ownerId?: SyncOwnerId;
      storeId?: SyncStoreId;
      events?: LiveStoreEvent.Global.Encoded[];
    } = {};
    const syncService = new TestSyncService(async (payload) => {
      captured.ownerId = payload.ownerId;
      captured.storeId = payload.storeId;
      captured.events = payload.events;
      return { lastSeqNum: GlobalSequenceNumber.from(5) };
    });
    const controller = new SyncController(syncService);

    const dto: PushEventsDto = {
      storeId: 'store-1',
      events: [
        {
          name: 'event.one',
          args: { ok: true },
          seqNum: 4,
          parentSeqNum: 3,
          clientId: 'client-1',
          sessionId: 'session-1',
        },
      ],
    };
    const result = await controller.push(dto, makeIdentity());
    expect(result).toEqual({ ok: true, lastSeqNum: 5 });
    expect(captured.ownerId?.unwrap()).toBe('owner-1');
    expect(captured.storeId?.unwrap()).toBe('store-1');
    expect(captured.events?.[0]?.seqNum).toEqual(
      EventSequenceNumber.Global.make(4)
    );
  });

  it('throws conflict exception when push validation fails', async () => {
    const syncService = new TestSyncService(async () => {
      throw new PushValidationError('conflict', {
        minimumExpectedSeqNum: 3,
        providedSeqNum: 2,
      });
    });
    const controller = new SyncController(syncService);
    const dto: PushEventsDto = {
      storeId: 'store-1',
      events: [],
    };
    await expect(controller.push(dto, makeIdentity())).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('throws forbidden when access denied', async () => {
    const syncService = new TestSyncService(async () => {
      throw new SyncAccessDeniedError('denied');
    });
    const controller = new SyncController(syncService);
    const dto: PushEventsDto = {
      storeId: 'store-1',
      events: [],
    };
    await expect(controller.push(dto, makeIdentity())).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('rejects missing identity on push', async () => {
    const syncService = new TestSyncService();
    const controller = new SyncController(syncService);
    const dto: PushEventsDto = {
      storeId: 'store-1',
      events: [],
    };
    // @ts-expect-error - exercising runtime guard for missing identity
    await expect(controller.push(dto, undefined)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('pulls events with clamped wait and hasMore logic', async () => {
    const syncService = new TestSyncService(undefined, async (payload) => {
      expect(payload.waitMs).toBe(25_000);
      return {
        events: [
          {
            ownerId: payload.ownerId,
            storeId: payload.storeId,
            name: 'event.one',
            args: { ok: true },
            seqNum: GlobalSequenceNumber.from(2),
            parentSeqNum: GlobalSequenceNumber.from(1),
            clientId: 'client-1',
            sessionId: 'session-1',
            createdAt: new Date(),
          },
        ],
        head: GlobalSequenceNumber.from(3),
      };
    });
    const controller = new SyncController(syncService);
    const dto: PullEventsDto = {
      storeId: 'store-1',
      since: 1,
      limit: 1,
      waitMs: 99_999,
    };
    const result = await controller.pull(dto, makeIdentity());
    expect(result.events).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.headSeqNum).toBe(3);
  });

  it('rejects missing identity on pull', async () => {
    const syncService = new TestSyncService();
    const controller = new SyncController(syncService);
    const dto: PullEventsDto = {
      storeId: 'store-1',
    };
    // @ts-expect-error - exercising runtime guard for missing identity
    await expect(controller.pull(dto, undefined)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
