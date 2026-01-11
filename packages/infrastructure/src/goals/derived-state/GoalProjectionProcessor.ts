import type { KeyStorePort, EncryptedEvent } from '@mo/application';
import { ProjectionOrderings } from '@mo/eventstore-core';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { MissingKeyError } from '../../errors';
import { EncryptedEventToDomainAdapter } from '../../eventstore/adapters/EncryptedEventToDomainAdapter';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { KeyringManager } from '../../crypto/KeyringManager';
import {
  IndexBuildPhases,
  IndexingPort,
  ProjectionRuntimePort,
  type IndexBuildPhase,
  type ProjectionStatus,
} from '../../platform/derived-state';
import { IndexArtifactStore, ProjectionCacheStore } from '../../platform/derived-state';
import { ProjectionRuntime } from '../../platform/derived-state/runtime/ProjectionRuntime';
import type {
  ProjectionApplyInput,
  ProjectionApplyResult,
  ProjectionBatchInfo,
  ProjectionBootstrap,
  ProjectionProcessor,
} from '../../platform/derived-state/runtime/ProjectionRuntime';
import { GoalAnalyticsProjector } from './GoalAnalyticsProjector';
import { GoalSearchProjector } from './GoalSearchProjector';
import { GoalSnapshotProjector } from './GoalSnapshotProjector';
import { isGoalEvent, type GoalListItem } from '../projections/model/GoalProjectionState';

const PROJECTION_ID = 'goal_projection';

export class GoalProjectionProcessor implements ProjectionRuntimePort, IndexingPort {
  readonly projectionId = PROJECTION_ID;
  readonly ordering = ProjectionOrderings.effectiveTotalOrder;
  private readonly runtime: ProjectionRuntime;
  private readonly cacheStore: ProjectionCacheStore;
  private readonly indexStore: IndexArtifactStore;
  private readonly snapshotProjector: GoalSnapshotProjector;
  private readonly analyticsProjector: GoalAnalyticsProjector;
  private readonly searchProjector: GoalSearchProjector;
  private readonly listeners = new Set<() => void>();

  constructor(
    db: SqliteDbPort,
    crypto: WebCryptoService,
    keyStore: KeyStorePort,
    private readonly keyringManager: KeyringManager,
    private readonly toDomain: EncryptedEventToDomainAdapter
  ) {
    this.cacheStore = new ProjectionCacheStore(db);
    this.indexStore = new IndexArtifactStore(db);
    this.snapshotProjector = new GoalSnapshotProjector(this.cacheStore, crypto, keyStore);
    this.analyticsProjector = new GoalAnalyticsProjector(this.cacheStore, crypto, keyStore);
    this.searchProjector = new GoalSearchProjector(this.indexStore, crypto, keyStore);

    const processor: ProjectionProcessor = {
      projectionId: this.projectionId,
      ordering: this.ordering,
      bootstrap: (input) => this.bootstrap(input),
      applyEvent: (input) => this.applyEvent(input),
      onBatchComplete: (input) => this.onBatchComplete(input),
      reset: () => this.reset(),
    };

    this.runtime = new ProjectionRuntime(db, 'goal', processor);
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

  listGoals(): GoalListItem[] {
    return [...this.snapshotProjector.listProjections()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getGoalById(goalId: string): GoalListItem | null {
    return this.snapshotProjector.getProjection(goalId);
  }

  async searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): Promise<GoalListItem[]> {
    await this.searchProjector.ensureBuilt(this.snapshotProjector.listProjections());
    return this.searchProjector.searchGoals(term, this.snapshotProjector.getProjectionsMap(), filter);
  }

  async ensureBuilt(indexId: string): Promise<void> {
    if (indexId !== 'goal_search') return;
    await this.searchProjector.ensureBuilt(this.snapshotProjector.listProjections());
  }

  async status(indexId: string): Promise<Readonly<{ indexId: string; phase: IndexBuildPhase }>> {
    if (indexId !== 'goal_search') {
      return { indexId, phase: IndexBuildPhases.missing };
    }
    return this.searchProjector.status();
  }

  private async bootstrap(_input: ProjectionBootstrap): Promise<void> {
    await this.snapshotProjector.bootstrapFromCache();
  }

  private async applyEvent(input: ProjectionApplyInput): Promise<ProjectionApplyResult> {
    const event = this.toEncryptedEvent(input.event);
    const cursor = input.cursorAfter;
    try {
      const kGoal = await this.keyringManager.resolveKeyForEvent(event);
      const domainEvent = await this.toDomain.toDomain(event, kGoal);
      if (!isGoalEvent(domainEvent)) {
        return { changed: false };
      }

      const applyResult = await this.snapshotProjector.applyEvent(
        event,
        domainEvent,
        kGoal,
        cursor,
        input.lastCommitSequence
      );
      if (!applyResult.changed || !applyResult.next) {
        return { changed: false };
      }

      await this.analyticsProjector.updateAnalytics(
        applyResult.previous,
        applyResult.next,
        cursor,
        input.lastCommitSequence
      );
      this.searchProjector.applyProjectionChange(applyResult.previousItem, applyResult.nextItem);
      if (applyResult.changed) {
        this.emitProjectionChanged();
      }
      return { changed: applyResult.changed };
    } catch (error) {
      if (error instanceof MissingKeyError) {
        console.warn('[GoalProjectionProcessor] Missing key, skipping event for aggregate', event.aggregateId);
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
    this.analyticsProjector.clearCache();
    this.searchProjector.reset();
    await this.snapshotProjector.clearPersisted();
    await this.analyticsProjector.clearPersisted();
    await this.searchProjector.clearPersisted();
  }

  private emitProjectionChanged(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[GoalProjectionProcessor] listener threw', error);
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
  }): EncryptedEvent {
    return {
      id: record.id,
      aggregateType: 'goal',
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      payload: record.payload,
      version: record.version,
      occurredAt: record.occurredAt,
      actorId: record.actorId ?? undefined,
      causationId: record.causationId ?? undefined,
      correlationId: record.correlationId ?? undefined,
      sequence: record.commitSequence,
    };
  }
}
