import type { KeyStorePort, EncryptedEvent } from '@mo/application';
import type { EffectiveCursor } from '@mo/eventstore-core';
import { ProjectionOrderings } from '@mo/eventstore-core';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { MissingKeyError } from '../../errors';
import {
  applyProjectEventToSnapshot,
  projectSnapshotToListItem,
  type ProjectListItem,
  type ProjectSnapshotState,
  type SupportedProjectEvent,
} from '../projections/model/ProjectProjectionState';
import {
  decodeProjectSnapshotState,
  encodeProjectSnapshotState,
} from '../snapshots/ProjectSnapshotCodec';
import {
  buildProjectionCacheAad,
  ProjectionCacheStore,
} from '../../platform/derived-state';

const PROJECTION_ID = 'project_snapshot';

type SnapshotApplyResult = {
  changed: boolean;
  previous: ProjectSnapshotState | null;
  next: ProjectSnapshotState | null;
  previousItem: ProjectListItem | null;
  nextItem: ProjectListItem | null;
};

export class ProjectSnapshotProjector {
  private readonly snapshots = new Map<string, ProjectSnapshotState>();
  private readonly projections = new Map<string, ProjectListItem>();

  constructor(
    private readonly cacheStore: ProjectionCacheStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {}

  listProjections(): ProjectListItem[] {
    return [...this.projections.values()];
  }

  getProjection(aggregateId: string): ProjectListItem | null {
    return this.projections.get(aggregateId) ?? null;
  }

  getProjectionsMap(): Map<string, ProjectListItem> {
    return this.projections;
  }

  clearCaches(): void {
    this.snapshots.clear();
    this.projections.clear();
  }

  async bootstrapFromCache(): Promise<void> {
    const rows = await this.cacheStore.listByProjection(PROJECTION_ID);
    for (const row of rows) {
      const aggregateId = row.scopeKey;
      const kProject = await this.keyStore.getAggregateKey(aggregateId);
      if (!kProject) continue;
      try {
        const snapshot = await this.decryptSnapshot(
          aggregateId,
          row.cacheEncrypted,
          row.cacheVersion,
          row.lastEffectiveCursor,
          kProject
        );
        if (!snapshot || snapshot.archivedAt !== null) continue;
        this.snapshots.set(aggregateId, snapshot);
        this.projections.set(aggregateId, projectSnapshotToListItem(snapshot));
      } catch {
        await this.cacheStore.remove(PROJECTION_ID, aggregateId);
      }
    }
  }

  async applyEvent(
    event: EncryptedEvent,
    domainEvent: SupportedProjectEvent,
    key: Uint8Array,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<SnapshotApplyResult> {
    const previousSnapshot =
      this.snapshots.get(event.aggregateId) ??
      (await this.loadSnapshot(event.aggregateId, key));
    const previousItem =
      this.projections.get(event.aggregateId) ??
      (previousSnapshot ? projectSnapshotToListItem(previousSnapshot) : null);
    const nextVersion = previousSnapshot ? previousSnapshot.version + 1 : 1;
    const nextSnapshot = applyProjectEventToSnapshot(
      previousSnapshot,
      domainEvent,
      nextVersion
    );
    if (!nextSnapshot) {
      return {
        changed: false,
        previous: previousSnapshot,
        next: null,
        previousItem,
        nextItem: null,
      };
    }

    await this.persistSnapshot(
      event.aggregateId,
      nextSnapshot,
      key,
      cursor,
      lastCommitSequence
    );
    this.snapshots.set(event.aggregateId, nextSnapshot);

    if (nextSnapshot.archivedAt === null) {
      const nextItem = projectSnapshotToListItem(nextSnapshot);
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

  private async loadSnapshot(
    aggregateId: string,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const row = await this.cacheStore.get(PROJECTION_ID, aggregateId);
    if (!row) return null;
    try {
      return await this.decryptSnapshot(
        aggregateId,
        row.cacheEncrypted,
        row.cacheVersion,
        row.lastEffectiveCursor,
        key
      );
    } catch {
      await this.cacheStore.remove(PROJECTION_ID, aggregateId);
      return null;
    }
  }

  private async decryptSnapshot(
    aggregateId: string,
    payload: Uint8Array,
    version: number,
    cursor: EffectiveCursor,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const aad = buildProjectionCacheAad(
      PROJECTION_ID,
      aggregateId,
      version,
      cursor
    );
    const plaintext = await this.crypto.decrypt(payload, key, aad);
    return decodeProjectSnapshotState(plaintext, version);
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: ProjectSnapshotState,
    key: Uint8Array,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<void> {
    const aad = buildProjectionCacheAad(
      PROJECTION_ID,
      aggregateId,
      snapshot.version,
      cursor
    );
    const cipher = await this.crypto.encrypt(
      encodeProjectSnapshotState(snapshot),
      key,
      aad
    );
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
