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
const META_LAST_SEQUENCE_EVENT_ID_KEY = 'last_sequence_event_id';
const META_LAST_SEQUENCE_EVENT_VERSION_KEY = 'last_sequence_event_version';
const PRUNE_TAIL_SEQUENCE_WINDOW = 10;

type SequenceCursor = Readonly<{ id: string; version: number }>;

export class GoalProjectionRuntime {
  private readonly processingRunner = new ProjectionTaskRunner(
    'GoalProjectionProcessor',
    100
  );
  private started = false;
  private lastSequence = 0;
  private lastSequenceCursor: SequenceCursor | null = null;
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
      this.lastSequenceCursor = null;
    } else {
      this.lastSequence = await this.loadLastSequence();
      this.lastSequenceCursor = await this.loadLastSequenceCursor();
    }

    // If the event log has been rebased/rolled back, our out-of-band projections
    // (snapshots/analytics/search) are not automatically rolled back by LiveStore.
    // Detect cursor divergence and rebuild deterministically.
    await this.maybeRebuildForCursorMismatch('start');

    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(this.getEventsTailQuery(), () => {
      void this.processNewEvents();
    });
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
    this.lastSequenceCursor = null;
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
      query: 'DELETE FROM goal_search_index',
      bindValues: [],
    });
    await this.saveLastSequenceCursor(0, null);
    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(this.getEventsTailQuery(), () => {
      void this.processNewEvents();
    });
    this.started = true;
    this.emitProjectionChanged();
  }

  private async processNewEvents(): Promise<void> {
    await this.processingRunner.run(() => this.runProcessNewEvents());
  }

  private async runProcessNewEvents(): Promise<void> {
    const rebuilt = await this.maybeRebuildForCursorMismatch('process');
    if (rebuilt) {
      return;
    }
    const events = await this.eventStore.getAllEvents({
      since: this.lastSequence,
    });
    if (events.length === 0) return;
    let processedMax = this.lastSequence;
    let processedMaxCursor: SequenceCursor | null = this.lastSequenceCursor;
    let projectionChanged = false;
    for (const event of events) {
      try {
        const changed = await this.projectEvent(event);
        projectionChanged = projectionChanged || changed;
        if (event.sequence && event.sequence > processedMax) {
          processedMax = event.sequence;
          processedMaxCursor = { id: event.id, version: event.version };
        }
      } catch (error) {
        if (error instanceof MissingKeyError) {
          console.warn(
            '[GoalProjectionProcessor] Missing key, skipping event for aggregate',
            event.aggregateId
          );
          if (event.sequence && event.sequence > processedMax) {
            processedMax = event.sequence;
            processedMaxCursor = { id: event.id, version: event.version };
          }
          continue;
        }
        throw error;
      }
    }
    if (processedMax > this.lastSequence) {
      this.lastSequence = processedMax;
      this.lastSequenceCursor = processedMaxCursor;
      await this.saveLastSequenceCursor(processedMax, processedMaxCursor);
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

  private async loadLastSequenceCursor(): Promise<SequenceCursor | null> {
    const idRows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM goal_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_EVENT_ID_KEY],
    });
    const versionRows = this.store.query<{ value: string }[]>({
      query: 'SELECT value FROM goal_projection_meta WHERE key = ? LIMIT 1',
      bindValues: [META_LAST_SEQUENCE_EVENT_VERSION_KEY],
    });
    const id = idRows[0]?.value;
    const versionStr = versionRows[0]?.value;
    const version = versionStr !== undefined ? Number(versionStr) : NaN;
    if (!id || !Number.isFinite(version)) {
      return null;
    }
    return { id, version };
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

  private async saveLastSequenceCursor(
    sequence: number,
    cursor: SequenceCursor | null
  ): Promise<void> {
    await this.saveLastSequence(sequence);
    this.store.query({
      query: `
        INSERT INTO goal_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [META_LAST_SEQUENCE_EVENT_ID_KEY, cursor?.id ?? ''],
    });
    this.store.query({
      query: `
        INSERT INTO goal_projection_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      bindValues: [
        META_LAST_SEQUENCE_EVENT_VERSION_KEY,
        cursor ? String(cursor.version) : '',
      ],
    });
  }

  private getEventsTailQuery() {
    return goalTables.goal_events
      .select('sequence', 'id', 'version')
      .orderBy('sequence', 'desc')
      .first();
  }

  private getEventCursorAtSequence(sequence: number): SequenceCursor | null {
    const rows = this.store.query<{ id: string; version: number }[]>({
      query: 'SELECT id, version FROM goal_events WHERE sequence = ? LIMIT 1',
      bindValues: [sequence],
    });
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, version: Number(row.version) };
  }

  private async maybeRebuildForCursorMismatch(
    source: 'start' | 'process'
  ): Promise<boolean> {
    if (this.lastSequence === 0) return false;
    const actual = this.getEventCursorAtSequence(this.lastSequence);
    if (!actual) {
      await this.rebuildFromScratch({
        reason: 'missing_cursor_row',
        source,
      });
      return true;
    }
    if (!this.lastSequenceCursor) {
      // Cursor meta was introduced later; seed it from the live table.
      this.lastSequenceCursor = actual;
      await this.saveLastSequenceCursor(this.lastSequence, actual);
      return false;
    }
    if (
      this.lastSequenceCursor.id !== actual.id ||
      this.lastSequenceCursor.version !== actual.version
    ) {
      await this.rebuildFromScratch({
        reason: 'cursor_mismatch',
        source,
        expected: this.lastSequenceCursor,
        actual,
      });
      return true;
    }
    return false;
  }

  private async rebuildFromScratch(input: {
    reason: 'missing_cursor_row' | 'cursor_mismatch';
    source: 'start' | 'process';
    expected?: SequenceCursor;
    actual?: SequenceCursor;
  }): Promise<void> {
    console.warn(
      '[GoalProjectionProcessor] Rebuilding projections after rebase',
      {
        ...input,
        lastSequence: this.lastSequence,
      }
    );

    // Clear derived state (out-of-band writes) so the projections match the rebased event log.
    this.lastSequence = 0;
    this.lastSequenceCursor = null;
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
      query: 'DELETE FROM goal_search_index',
      bindValues: [],
    });
    await this.saveLastSequenceCursor(0, null);

    await this.snapshotProjector.bootstrapFromSnapshots();
    await this.searchProjector.bootstrapFromProjections(
      this.snapshotProjector.listProjections(),
      this.lastSequence
    );
    // Re-run processing immediately (without re-entering ProjectionTaskRunner).
    await this.runProcessNewEvents();
    this.emitProjectionChanged();
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
