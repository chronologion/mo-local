import type { Store } from '@livestore/livestore';
import type { IEventStore, IKeyStore } from '@mo/application';
import { goalTables } from '../../schema';
import { LiveStoreToDomainAdapter } from '../../../livestore/adapters/LiveStoreToDomainAdapter';
import { ProjectionTaskRunner } from '../../../projection/ProjectionTaskRunner';
import { MissingKeyError } from '../../../errors';
import { isGoalEvent, type GoalListItem } from '../model/GoalProjectionState';
import type { EncryptedEvent } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { KeyringManager } from '../../../crypto/KeyringManager';
import { GoalAnalyticsProjector } from './GoalAnalyticsProjector';
import { GoalSnapshotProjector } from './GoalSnapshotProjector';
import { GoalSearchProjector } from './GoalSearchProjector';
import { GoalPruneProjector } from './GoalPruneProjector';

const META_LAST_SEQUENCE_KEY = 'last_sequence';
const PRUNE_TAIL_SEQUENCE_WINDOW = 10;

export class GoalProjectionRuntime {
  private readonly processingRunner = new ProjectionTaskRunner(
    'GoalProjectionProcessor',
    100
  );
  private started = false;
  private lastSequence = 0;
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  private readonly snapshotProjector: GoalSnapshotProjector;
  private readonly analyticsProjector: GoalAnalyticsProjector;
  private readonly searchProjector: GoalSearchProjector;
  private readonly pruneProjector: GoalPruneProjector;

  constructor(
    private readonly store: Store,
    private readonly eventStore: IEventStore,
    crypto: WebCryptoService,
    keyStore: IKeyStore,
    private readonly keyringManager: KeyringManager,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {
    this.snapshotProjector = new GoalSnapshotProjector(store, crypto, keyStore);
    this.analyticsProjector = new GoalAnalyticsProjector(
      store,
      crypto,
      keyStore
    );
    this.searchProjector = new GoalSearchProjector(store, crypto, keyStore);
    this.pruneProjector = new GoalPruneProjector(store);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const snapshotCount = this.store.query<{ count: number }[]>({
      query: 'SELECT COUNT(*) as count FROM goal_snapshots',
      bindValues: [],
    });
    if (Number(snapshotCount[0]?.count ?? 0) === 0) {
      this.lastSequence = 0;
    } else {
      this.lastSequence = await this.loadLastSequence();
    }
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(
      goalTables.goal_events.count(),
      () => {
        void this.processNewEvents();
      }
    );
    this.resolveReady?.();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }

  async flush(): Promise<void> {
    await this.processNewEvents();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  listGoals(): GoalListItem[] {
    return [...this.snapshotProjector.listProjections()].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  getGoalById(goalId: string): GoalListItem | null {
    return this.snapshotProjector.getProjection(goalId);
  }

  searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): GoalListItem[] {
    return this.searchProjector.searchGoals(
      term,
      this.snapshotProjector.getProjectionsMap(),
      filter
    );
  }

  async resetAndRebuild(): Promise<void> {
    this.stop();
    this.lastSequence = 0;
    this.snapshotProjector.clearCaches();
    this.analyticsProjector.clearCache();
    this.searchProjector.reset();
    this.store.query({
      query: 'DELETE FROM goal_snapshots',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM goal_analytics',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM goal_projection_meta',
      bindValues: [],
    });
    this.store.query({
      query: 'DELETE FROM goal_search_index',
      bindValues: [],
    });
    await this.saveLastSequence(0);
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(
      goalTables.goal_events.count(),
      () => {
        void this.processNewEvents();
      }
    );
    this.emitProjectionChanged();
  }

  private async processNewEvents(): Promise<void> {
    await this.processingRunner.run(() => this.runProcessNewEvents());
  }

  private async runProcessNewEvents(): Promise<void> {
    const events = await this.eventStore.getAllEvents({
      since: this.lastSequence,
    });
    if (events.length === 0) return;
    let processedMax = this.lastSequence;
    let projectionChanged = false;
    for (const event of events) {
      try {
        const changed = await this.projectEvent(event);
        projectionChanged = projectionChanged || changed;
        if (event.sequence && event.sequence > processedMax) {
          processedMax = event.sequence;
        }
      } catch (error) {
        if (error instanceof MissingKeyError) {
          console.warn(
            '[GoalProjectionProcessor] Missing key, skipping event for aggregate',
            event.aggregateId
          );
          if (event.sequence && event.sequence > processedMax) {
            processedMax = event.sequence;
          }
          continue;
        }
        throw error;
      }
    }
    if (processedMax > this.lastSequence) {
      this.lastSequence = processedMax;
      await this.saveLastSequence(processedMax);
      await this.searchProjector.persistIndex(processedMax, Date.now());
      const pruneThreshold = processedMax - PRUNE_TAIL_SEQUENCE_WINDOW;
      if (pruneThreshold > 0) {
        this.pruneProjector.pruneProcessedEvents(pruneThreshold);
      }
    }
    if (projectionChanged) {
      this.emitProjectionChanged();
    }
  }

  private async projectEvent(event: EncryptedEvent): Promise<boolean> {
    if (!event.sequence) {
      throw new Error(`Event ${event.id} missing sequence`);
    }

    const kGoal = await this.keyringManager.resolveKeyForEvent(event);
    const domainEvent = await this.toDomain.toDomain(event, kGoal);
    if (!isGoalEvent(domainEvent)) {
      return false;
    }

    const applyResult = await this.snapshotProjector.applyEvent(
      event,
      domainEvent,
      kGoal
    );
    if (!applyResult.changed || !applyResult.next) {
      return false;
    }

    await this.analyticsProjector.updateAnalytics(
      domainEvent,
      applyResult.previous,
      applyResult.next,
      event.sequence,
      event.occurredAt
    );
    this.searchProjector.applyProjectionChange(
      applyResult.previousItem,
      applyResult.nextItem
    );
    return true;
  }

  private async loadLastSequence(): Promise<number> {
    const rows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM goal_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_KEY],
    });
    if (!rows.length) return 0;
    const parsed = Number(rows[0].value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async saveLastSequence(sequence: number): Promise<void> {
    this.store.query({
      query: `
        INSERT INTO goal_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [META_LAST_SEQUENCE_KEY, String(sequence)],
    });
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
}
