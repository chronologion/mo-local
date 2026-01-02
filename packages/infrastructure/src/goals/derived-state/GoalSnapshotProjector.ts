import type { KeyStorePort } from '@mo/application';
import type { EffectiveCursor } from '@mo/eventstore-core';
import { ProjectionOrderings } from '@mo/eventstore-core';
import type { EncryptedEvent } from '@mo/application';
import { MissingKeyError } from '../../errors';
import { decodeGoalSnapshotState, encodeGoalSnapshotState } from '../snapshots/GoalSnapshotCodec';
import {
  GoalSnapshotState,
  applyEventToSnapshot,
  snapshotToListItem,
  type GoalEvent,
  type GoalListItem,
} from '../projections/model/GoalProjectionState';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { buildProjectionCacheAad, ProjectionCacheStore } from '../../platform/derived-state';

const PROJECTION_ID = 'goal_snapshot';

type SnapshotApplyResult = {
  changed: boolean;
  previous: GoalSnapshotState | null;
  next: GoalSnapshotState | null;
  previousItem: GoalListItem | null;
  nextItem: GoalListItem | null;
};

export class GoalSnapshotProjector {
  private readonly snapshots = new Map<string, GoalSnapshotState>();
  private readonly projections = new Map<string, GoalListItem>();

  constructor(
    private readonly cacheStore: ProjectionCacheStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {}

  listProjections(): GoalListItem[] {
    return [...this.projections.values()];
  }

  getProjectionsMap(): Map<string, GoalListItem> {
    return this.projections;
  }

  getProjection(aggregateId: string): GoalListItem | null {
    return this.projections.get(aggregateId) ?? null;
  }

  getSnapshot(aggregateId: string): GoalSnapshotState | null {
    return this.snapshots.get(aggregateId) ?? null;
  }

  clearCaches(): void {
    this.snapshots.clear();
    this.projections.clear();
  }

  async bootstrapFromCache(): Promise<void> {
    const rows = await this.cacheStore.listByProjection(PROJECTION_ID);
    for (const row of rows) {
      const aggregateId = row.scopeKey;
      const kGoal = await this.keyStore.getAggregateKey(aggregateId);
      if (!kGoal) continue;
      try {
        const snapshot = await this.decryptSnapshot(
          aggregateId,
          row.cacheEncrypted,
          row.cacheVersion,
          row.lastEffectiveCursor,
          kGoal
        );
        if (!snapshot || snapshot.archivedAt !== null) continue;
        this.snapshots.set(aggregateId, snapshot);
        this.projections.set(aggregateId, snapshotToListItem(snapshot));
      } catch {
        await this.cacheStore.remove(PROJECTION_ID, aggregateId);
      }
    }
  }

  async applyEvent(
    event: EncryptedEvent,
    domainEvent: GoalEvent,
    key: Uint8Array,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<SnapshotApplyResult> {
    const previousSnapshot = this.snapshots.get(event.aggregateId) ?? (await this.loadSnapshot(event.aggregateId, key));
    const previousItem =
      this.projections.get(event.aggregateId) ?? (previousSnapshot ? snapshotToListItem(previousSnapshot) : null);
    const nextVersion = previousSnapshot ? previousSnapshot.version + 1 : 1;
    const nextSnapshot = applyEventToSnapshot(previousSnapshot, domainEvent, nextVersion);
    if (!nextSnapshot) {
      return {
        changed: false,
        previous: previousSnapshot,
        next: null,
        previousItem,
        nextItem: null,
      };
    }

    await this.persistSnapshot(event.aggregateId, nextSnapshot, key, cursor, lastCommitSequence);
    this.snapshots.set(event.aggregateId, nextSnapshot);

    if (nextSnapshot.archivedAt === null) {
      const nextItem = snapshotToListItem(nextSnapshot);
      this.projections.set(event.aggregateId, nextItem);
      return {
        changed: true,
        previous: previousSnapshot,
        next: nextSnapshot,
        previousItem,
        nextItem,
      };
    }

    this.projections.delete(event.aggregateId);
    return {
      changed: true,
      previous: previousSnapshot,
      next: nextSnapshot,
      previousItem,
      nextItem: null,
    };
  }

  async requireAggregateKey(aggregateId: string): Promise<Uint8Array> {
    const key = await this.keyStore.getAggregateKey(aggregateId);
    if (!key) {
      throw new MissingKeyError(`Missing aggregate key for ${aggregateId}`);
    }
    return key;
  }

  async clearPersisted(): Promise<void> {
    await this.cacheStore.removeAll(PROJECTION_ID);
  }

  private async loadSnapshot(aggregateId: string, kGoal: Uint8Array): Promise<GoalSnapshotState | null> {
    const row = await this.cacheStore.get(PROJECTION_ID, aggregateId);
    if (!row) return null;
    try {
      return await this.decryptSnapshot(
        aggregateId,
        row.cacheEncrypted,
        row.cacheVersion,
        row.lastEffectiveCursor,
        kGoal
      );
    } catch {
      await this.cacheStore.remove(PROJECTION_ID, aggregateId);
      return null;
    }
  }

  private async decryptSnapshot(
    aggregateId: string,
    cipher: Uint8Array,
    version: number,
    cursor: EffectiveCursor,
    kGoal: Uint8Array
  ): Promise<GoalSnapshotState | null> {
    const aad = buildProjectionCacheAad(PROJECTION_ID, aggregateId, version, cursor);
    const plaintext = await this.crypto.decrypt(cipher, kGoal, aad);
    return decodeGoalSnapshotState(plaintext, version);
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: GoalSnapshotState,
    kGoal: Uint8Array,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<void> {
    const aad = buildProjectionCacheAad(PROJECTION_ID, aggregateId, snapshot.version, cursor);
    const cipher = await this.crypto.encrypt(encodeGoalSnapshotState(snapshot), kGoal, aad);

    await this.cacheStore.put({
      projectionId: PROJECTION_ID,
      scopeKey: aggregateId,
      cacheVersion: snapshot.version,
      cacheEncrypted: cipher,
      ordering: ProjectionOrderings.effectiveTotalOrder,
      lastEffectiveCursor: cursor,
      lastCommitSequence,
      writtenAt: Date.now(),
    });
  }
}
