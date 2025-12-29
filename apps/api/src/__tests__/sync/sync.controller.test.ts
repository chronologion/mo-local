import { describe, expect, it } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SyncController } from '../../sync/presentation/sync.controller';
import { SyncService } from '../../sync/application/sync.service';
import { SyncOwnerId } from '../../sync/domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../../sync/domain/value-objects/SyncStoreId';
import { GlobalSequenceNumber } from '../../sync/domain/value-objects/GlobalSequenceNumber';
import { SyncAccessDeniedError } from '../../sync/application/ports/sync-access-policy';
import { SyncAccessPolicy } from '../../sync/application/ports/sync-access-policy';
import { SyncEventRepository } from '../../sync/application/ports/sync-event-repository';
import { SyncStoreRepository } from '../../sync/application/ports/sync-store-repository';
import type { AuthenticatedIdentity } from '../../access/application/authenticated-identity';

type PushEventDto = {
  eventId: string;
  recordJson: string;
};

type PushEventsDto = {
  storeId: string;
  expectedHead: number;
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

  override async appendBatch() {
    return { head: GlobalSequenceNumber.from(0), assigned: [] };
  }

  override async loadSince() {
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
    private readonly pullImpl?: SyncService['pullEvents']
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

  override async pullEvents(params: Parameters<SyncService['pullEvents']>[0]) {
    if (this.pullImpl) {
      return this.pullImpl(params);
    }
    return super.pullEvents(params);
  }
}

describe('SyncController', () => {
  it('pushes events and returns assigned sequences', async () => {
    const captured: {
      ownerId?: SyncOwnerId;
      storeId?: SyncStoreId;
      expectedHead?: GlobalSequenceNumber;
      events?: ReadonlyArray<PushEventDto>;
    } = {};
    const syncService = new TestSyncService(async (payload) => {
      captured.ownerId = payload.ownerId;
      captured.storeId = payload.storeId;
      captured.expectedHead = payload.expectedHead;
      captured.events = payload.events;
      return {
        ok: true,
        head: GlobalSequenceNumber.from(5),
        assigned: [
          {
            eventId: payload.events[0]?.eventId ?? 'e1',
            globalSequence: GlobalSequenceNumber.from(5),
          },
        ],
      };
    });
    const controller = new SyncController(syncService);

    const dto: PushEventsDto = {
      storeId: 'store-1',
      expectedHead: 4,
      events: [
        {
          eventId: 'e1',
          recordJson: '{"ok":true}',
        },
      ],
    };
    const result = await controller.push(dto, makeIdentity());
    expect(result).toEqual({
      ok: true,
      head: 5,
      assigned: [{ eventId: 'e1', globalSequence: 5 }],
    });
    expect(captured.ownerId?.unwrap()).toBe('owner-1');
    expect(captured.storeId?.unwrap()).toBe('store-1');
    expect(captured.expectedHead?.unwrap()).toBe(4);
  });

  it('returns conflict response when server ahead', async () => {
    const syncService = new TestSyncService(async () => ({
      ok: false,
      head: GlobalSequenceNumber.from(2),
      reason: 'server_ahead',
      missing: [
        {
          ownerId: SyncOwnerId.from('owner-1'),
          storeId: SyncStoreId.from('store-1'),
          globalSequence: GlobalSequenceNumber.from(1),
          eventId: 'e1',
          recordJson: '{"a":1}',
          createdAt: new Date(),
        },
      ],
    }));
    const controller = new SyncController(syncService);
    const dto: PushEventsDto = {
      storeId: 'store-1',
      expectedHead: 0,
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
      expectedHead: 0,
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
      expectedHead: 0,
      events: [],
    };
    // @ts-expect-error - exercising runtime guard for missing identity
    await expect(controller.push(dto, undefined)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('pulls events and returns next cursor info', async () => {
    const syncService = new TestSyncService(undefined, async (payload) => {
      return {
        events: [
          {
            ownerId: payload.ownerId,
            storeId: payload.storeId,
            globalSequence: GlobalSequenceNumber.from(2),
            eventId: 'e1',
            recordJson: '{"ok":true}',
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
      waitMs: 0,
    };
    const result = await controller.pull(dto, makeIdentity());
    expect(result.events).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.head).toBe(3);
    expect(result.nextSince).toBe(2);
  });

  it('waits when waitMs is provided and no events returned', async () => {
    const pullImpl = vi
      .fn()
      .mockResolvedValueOnce({
        events: [],
        head: GlobalSequenceNumber.from(0),
      })
      .mockResolvedValueOnce({
        events: [
          {
            ownerId: SyncOwnerId.from('owner-1'),
            storeId: SyncStoreId.from('store-1'),
            globalSequence: GlobalSequenceNumber.from(1),
            eventId: 'e1',
            recordJson: '{"ok":true}',
            createdAt: new Date(),
          },
        ],
        head: GlobalSequenceNumber.from(1),
      });
    const syncService = new TestSyncService(undefined, pullImpl);
    const controller = new SyncController(syncService);
    const dto: PullEventsDto = {
      storeId: 'store-1',
      since: 0,
      limit: 10,
      waitMs: 1,
    };
    const result = await controller.pull(dto, makeIdentity());
    expect(pullImpl).toHaveBeenCalledTimes(2);
    expect(result.events).toHaveLength(1);
    expect(result.nextSince).toBe(1);
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
