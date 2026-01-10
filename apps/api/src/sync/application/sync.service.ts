import { Injectable, Inject, Optional } from '@nestjs/common';
import { SyncEvent, SyncEventAssignment, SyncIncomingEvent } from '../domain/SyncEvent';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { SyncEventRepository, SyncRepositoryHeadMismatchError } from './ports/sync-event-repository';
import { SyncAccessDeniedError, SyncAccessPolicy } from './ports/sync-access-policy';
import { SyncStoreRepository } from './ports/sync-store-repository';
import { ScopeStateRepository } from '@sharing/application/ports/scope-state-repository';
import { ResourceGrantRepository } from '@sharing/application/ports/resource-grant-repository';
import { ScopeId } from '@sharing/domain/value-objects/ScopeId';
import { ResourceId } from '@sharing/domain/value-objects/ResourceId';
import { GrantId } from '@sharing/domain/value-objects/GrantId';

export type SyncPushOk = Readonly<{
  ok: true;
  head: GlobalSequenceNumber;
  assigned: ReadonlyArray<SyncEventAssignment>;
}>;

export type SyncPushConflictReason =
  | 'server_ahead'
  | 'server_behind'
  | 'missing_deps'
  | 'stale_scope_state'
  | 'stale_grant';

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
    private readonly accessPolicy: SyncAccessPolicy,
    @Optional() @Inject(ScopeStateRepository) private readonly scopeStateRepo?: ScopeStateRepository,
    @Optional() @Inject(ResourceGrantRepository) private readonly grantRepo?: ResourceGrantRepository
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

    // Validate sharing dependencies if present
    const validationError = await this.validateSharingDependencies(events);
    if (validationError) {
      const head = await this.repository.getHeadSequence(ownerId, storeId);
      return {
        ok: false,
        head,
        reason: validationError,
      };
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

  /**
   * Validate sharing dependencies for events that reference scopes/grants.
   * Returns null if valid, or a conflict reason if validation fails.
   */
  private async validateSharingDependencies(
    events: ReadonlyArray<SyncIncomingEvent>
  ): Promise<SyncPushConflictReason | null> {
    // Skip validation if sharing repositories not available
    if (!this.scopeStateRepo || !this.grantRepo) {
      return null;
    }

    for (const event of events) {
      // Skip events without sharing references
      if (!event.scopeId || !event.grantId || !event.scopeStateRef) {
        continue;
      }

      const scopeId = ScopeId.from(event.scopeId);
      const grantId = GrantId.from(event.grantId);
      const resourceId = event.resourceId ? ResourceId.from(event.resourceId) : null;

      // 1. Validate scopeStateRef exists
      const scopeState = await this.scopeStateRepo.loadByRef(event.scopeStateRef);
      if (!scopeState) {
        return 'missing_deps';
      }

      // 2. Validate grantId exists
      const grant = await this.grantRepo.loadByGrantId(grantId);
      if (!grant) {
        return 'missing_deps';
      }

      // 3. Validate scopeStateRef is current head
      const currentHead = await this.scopeStateRepo.getHeadRef(scopeId);
      if (!currentHead || !currentHead.equals(event.scopeStateRef)) {
        return 'stale_scope_state';
      }

      // 4. Validate grantId is current active grant (if resourceId specified)
      if (resourceId) {
        const activeGrant = await this.grantRepo.getActiveGrant(scopeId, resourceId);
        if (!activeGrant || !activeGrant.grantId.equals(grantId)) {
          return 'stale_grant';
        }
      }
    }

    return null;
  }
}
