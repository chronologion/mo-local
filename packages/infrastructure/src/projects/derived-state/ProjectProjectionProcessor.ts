import type { EncryptedEvent, KeyStorePort } from '@mo/application';
import { ProjectionOrderings } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { MissingKeyError } from '../../errors';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { KeyringManager } from '../../crypto/KeyringManager';
import {
  IndexBuildPhases,
  IndexingPort,
  ProjectionRuntimePort,
  type IndexBuildPhase,
  type ProjectionStatus,
} from '../../platform/derived-state';
import {
  IndexArtifactStore,
  ProjectionCacheStore,
} from '../../platform/derived-state';
import { ProjectionRuntime } from '../../platform/derived-state/runtime/ProjectionRuntime';
import type {
  ProjectionApplyInput,
  ProjectionApplyResult,
  ProjectionBatchInfo,
  ProjectionBootstrap,
  ProjectionProcessor,
} from '../../platform/derived-state/runtime/ProjectionRuntime';
import { ProjectSearchProjector } from './ProjectSearchProjector';
import { ProjectSnapshotProjector } from './ProjectSnapshotProjector';
import {
  isProjectEvent,
  type ProjectListItem,
} from '../projections/model/ProjectProjectionState';

const PROJECTION_ID = 'project_projection';

export class ProjectProjectionProcessor
  implements ProjectionRuntimePort, IndexingPort
{
  readonly projectionId = PROJECTION_ID;
  readonly ordering = ProjectionOrderings.effectiveTotalOrder;
  private readonly runtime: ProjectionRuntime;
  private readonly cacheStore: ProjectionCacheStore;
  private readonly indexStore: IndexArtifactStore;
  private readonly snapshotProjector: ProjectSnapshotProjector;
  private readonly searchProjector: ProjectSearchProjector;
  private readonly listeners = new Set<() => void>();

  constructor(
    db: SqliteDbPort,
    crypto: WebCryptoService,
    keyStore: KeyStorePort,
    private readonly keyringManager: KeyringManager,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {
    this.cacheStore = new ProjectionCacheStore(db);
    this.indexStore = new IndexArtifactStore(db);
    this.snapshotProjector = new ProjectSnapshotProjector(
      this.cacheStore,
      crypto,
      keyStore
    );
    this.searchProjector = new ProjectSearchProjector(
      this.indexStore,
      crypto,
      keyStore
    );

    const processor: ProjectionProcessor = {
      projectionId: this.projectionId,
      ordering: this.ordering,
      bootstrap: (input) => this.bootstrap(input),
      applyEvent: (input) => this.applyEvent(input),
      onBatchComplete: (input) => this.onBatchComplete(input),
      reset: () => this.reset(),
    };

    this.runtime = new ProjectionRuntime(db, 'project', processor);
  }

  start(): Promise<void> {
    return this.runtime.start();
  }

  stop(): void {
    this.runtime.stop();
  }

  whenReady(): Promise<void> {
    return this.runtime.whenReady();
  }

  flush(): Promise<void> {
    return this.runtime.flush();
  }

  onRebaseRequired(): Promise<void> {
    return this.runtime.onRebaseRequired();
  }

  resetAndRebuild(): Promise<void> {
    return this.runtime.onRebaseRequired();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getStatuses(): Promise<ReadonlyArray<ProjectionStatus>> {
    return this.runtime.getStatuses();
  }

  listProjects(filter?: {
    status?: string;
    goalId?: string | null;
  }): ProjectListItem[] {
    const items = [...this.snapshotProjector.listProjections()];
    const filtered = filter
      ? items.filter((item) => {
          if (filter.status && item.status !== filter.status) return false;
          if (filter.goalId !== undefined && item.goalId !== filter.goalId) {
            return false;
          }
          return true;
        })
      : items;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  getProjectById(projectId: string): ProjectListItem | null {
    return this.snapshotProjector.getProjection(projectId);
  }

  async searchProjects(
    term: string,
    filter?: { status?: string; goalId?: string | null }
  ): Promise<ProjectListItem[]> {
    await this.searchProjector.ensureBuilt(
      this.snapshotProjector.listProjections()
    );
    return this.searchProjector.searchProjects(
      term,
      this.snapshotProjector.getProjectionsMap(),
      filter
    );
  }

  async ensureBuilt(indexId: string): Promise<void> {
    if (indexId !== 'project_search') return;
    await this.searchProjector.ensureBuilt(
      this.snapshotProjector.listProjections()
    );
  }

  async status(
    indexId: string
  ): Promise<Readonly<{ indexId: string; phase: IndexBuildPhase }>> {
    if (indexId !== 'project_search') {
      return { indexId, phase: IndexBuildPhases.missing };
    }
    return this.searchProjector.status();
  }

  private async bootstrap(_input: ProjectionBootstrap): Promise<void> {
    await this.snapshotProjector.bootstrapFromCache();
  }

  private async applyEvent(
    input: ProjectionApplyInput
  ): Promise<ProjectionApplyResult> {
    const event = this.toEncryptedEvent(input.event);
    const cursor = input.cursorAfter;
    try {
      const kProject = await this.keyringManager.resolveKeyForEvent(event);
      const domainEvent = await this.toDomain.toDomain(event, kProject);
      if (!isProjectEvent(domainEvent)) {
        return { changed: false };
      }

      const applyResult = await this.snapshotProjector.applyEvent(
        event,
        domainEvent,
        kProject,
        cursor,
        input.lastCommitSequence
      );
      if (!applyResult.changed || !applyResult.next) {
        return { changed: false };
      }

      this.searchProjector.applyProjectionChange(
        applyResult.previousItem,
        applyResult.nextItem
      );
      if (applyResult.changed) {
        this.emitProjectionChanged();
      }
      return { changed: applyResult.changed };
    } catch (error) {
      if (error instanceof MissingKeyError) {
        console.warn(
          '[ProjectProjectionProcessor] Missing key, skipping event for aggregate',
          event.aggregateId
        );
        return { changed: false };
      }
      throw error;
    }
  }

  private async onBatchComplete(input: ProjectionBatchInfo): Promise<void> {
    await this.searchProjector.persistIndex(input.lastEffectiveCursor);
  }

  private async reset(): Promise<void> {
    this.snapshotProjector.clearCaches();
    this.searchProjector.reset();
    await this.snapshotProjector.clearPersisted();
    await this.searchProjector.clearPersisted();
  }

  private emitProjectionChanged(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[ProjectProjectionProcessor] listener threw', error);
      }
    });
  }

  private toEncryptedEvent(record: {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Uint8Array;
    version: number;
    occurredAt: number;
    actorId: string | null;
    causationId: string | null;
    correlationId: string | null;
    commitSequence: number;
    epoch: number | null;
    keyringUpdate: Uint8Array | null;
  }): EncryptedEvent {
    return {
      id: record.id,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      payload: record.payload,
      version: record.version,
      occurredAt: record.occurredAt,
      actorId: record.actorId ?? undefined,
      causationId: record.causationId ?? undefined,
      correlationId: record.correlationId ?? undefined,
      sequence: record.commitSequence,
      epoch: record.epoch ?? undefined,
      keyringUpdate: record.keyringUpdate ?? undefined,
    };
  }
}
