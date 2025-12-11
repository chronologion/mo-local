import { EncryptedEvent, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { IndexedDBKeyStore } from '../../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import { MissingKeyError } from '../../errors';
import { tables } from '../schema';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import MiniSearch, { type SearchResult } from 'minisearch';
import {
  AnalyticsDelta,
  GoalSnapshotState,
  applyEventToSnapshot,
  buildAnalyticsDeltas,
} from '../GoalProjectionState';
import {
  AnalyticsPayload,
  applyCategoryDelta,
  applyMonthlyDelta,
  createEmptyAnalytics,
} from './GoalAnalyticsState';
import { snapshotToListItem, type GoalListItem } from '../GoalProjectionState';

const META_LAST_SEQUENCE_KEY = 'last_sequence';
const ANALYTICS_AGGREGATE_ID = 'goal_analytics';
const SEARCH_INDEX_KEY = 'goal_search_index';
const PRUNE_TAIL_SEQUENCE_WINDOW = 10;

type SnapshotRow = {
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

type AnalyticsRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

type SearchIndexRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

/**
 * Processes goal events and maintains encrypted snapshot + analytics tables.
 * This runs in the main thread (triggered by LiveStore subscription) and is idempotent across restarts.
 */
export class GoalProjectionProcessor {
  private processingPromise: Promise<void> | null = null;
  private started = false;
  private lastSequence = 0;
  private unsubscribe: (() => void) | null = null;
  private analyticsCache: AnalyticsPayload | null = null;
  private readonly snapshots = new Map<string, GoalSnapshotState>();
  private readonly projections = new Map<string, GoalListItem>();
  private searchIndex: MiniSearch<GoalListItem>;
  private readonly listeners = new Set<() => void>();
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private readonly searchConfig = {
    idField: 'id',
    fields: ['summary'] as const,
    storeFields: [
      'id',
      'summary',
      'slice',
      'priority',
      'targetMonth',
      'createdAt',
      'archivedAt',
    ] as const,
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  };

  constructor(
    private readonly store: Store,
    private readonly eventStore: IEventStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IndexedDBKeyStore,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {
    this.searchIndex = this.createSearchIndex();
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  private createSearchIndex(): MiniSearch<GoalListItem> {
    return new MiniSearch<GoalListItem>({
      idField: this.searchConfig.idField,
      fields: [...this.searchConfig.fields],
      storeFields: [...this.searchConfig.storeFields],
      searchOptions: {
        ...this.searchConfig.searchOptions,
        prefix: true,
        combineWith: 'OR',
        fuzzy: 0.3,
        tokenize: (text: string) =>
          text
            .split(/\s+/)
            .flatMap((word) =>
              word.length >= 3 ? (word.match(/.{1,3}/g) ?? [word]) : [word]
            ),
      },
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
      // No snapshots persisted yet; force a full replay from the beginning.
      this.lastSequence = 0;
    } else {
      this.lastSequence = await this.loadLastSequence();
    }
    await this.bootstrapFromSnapshots();
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(tables.goal_events.count(), () => {
      void this.processNewEvents();
    });
    this.resolveReady?.();
  }

  /**
   * Public hook to force processing of any pending events.
   * Safe to call repeatedly; guarded by the internal processing flag.
   */
  async flush(): Promise<void> {
    await this.processNewEvents();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
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

  searchGoals(
    term: string,
    filter?: { slice?: string; month?: string; priority?: string }
  ): GoalListItem[] {
    const hits = term.trim()
      ? this.searchIndex.search(term)
      : ([...this.projections.values()].map((item) => ({
          id: item.id,
          score: 1,
        })) as Array<Pick<SearchResult, 'id' | 'score'>>);

    const filtered = hits
      .map((hit) => this.projections.get(String(hit.id)))
      .filter((item): item is GoalListItem => Boolean(item))
      .filter((item) => this.matchesFilter(item, filter));

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Rebuilds projections from scratch: clears snapshots/analytics/meta,
   * resets in-memory caches, and replays all events.
   */
  async resetAndRebuild(): Promise<void> {
    this.stop();
    this.processingPromise = null;
    this.lastSequence = 0;
    this.snapshots.clear();
    this.projections.clear();
    this.searchIndex = this.createSearchIndex();
    this.analyticsCache = null;
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
    await this.bootstrapFromSnapshots();
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(tables.goal_events.count(), () => {
      void this.processNewEvents();
    });
    this.emitProjectionChanged();
  }

  listGoals(): GoalListItem[] {
    return [...this.projections.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  getGoalById(goalId: string): GoalListItem | null {
    return this.projections.get(goalId) ?? null;
  }

  private async processNewEvents(): Promise<void> {
    if (this.processingPromise) {
      await this.processingPromise;
      return;
    }
    this.processingPromise = this.runProcessNewEvents();
    try {
      await this.processingPromise;
    } finally {
      this.processingPromise = null;
    }
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
            '[GoalProjectionProcessor] Missing key, will retry when key is available',
            event.aggregateId
          );
          break;
        }
        throw error;
      }
    }
    if (processedMax > this.lastSequence) {
      this.lastSequence = processedMax;
      await this.saveLastSequence(processedMax);
      const searchKey = await this.ensureSearchKey();
      await this.saveSearchIndex(searchKey, processedMax, Date.now());
      const pruneThreshold = processedMax - PRUNE_TAIL_SEQUENCE_WINDOW;
      if (pruneThreshold > 0) {
        this.pruneProcessedEvents(pruneThreshold);
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

    const kGoal = await this.keyStore.getAggregateKey(event.aggregateId);
    if (!kGoal) {
      throw new MissingKeyError(
        `Missing aggregate key for ${event.aggregateId}`
      );
    }

    const domainEvent = await this.toDomain.toDomain(event, kGoal);
    const previousSnapshot =
      this.snapshots.get(event.aggregateId) ??
      (await this.loadSnapshot(event.aggregateId, kGoal));
    const nextSnapshot = applyEventToSnapshot(
      previousSnapshot,
      domainEvent,
      event.version
    );
    if (!nextSnapshot) {
      // No snapshot to write (e.g., create missing); skip.
      return false;
    }

    await this.persistSnapshot(event.aggregateId, nextSnapshot, kGoal, event);
    await this.updateAnalytics(
      domainEvent,
      previousSnapshot,
      nextSnapshot,
      event.sequence,
      event.occurredAt
    );
    this.updateProjectionCache(event.aggregateId, nextSnapshot);
    return true;
  }

  private async bootstrapFromSnapshots(): Promise<void> {
    const searchKey = await this.ensureSearchKey();
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT aggregate_id, payload_encrypted, version, last_sequence, updated_at FROM goal_snapshots',
      bindValues: [],
    });
    for (const row of rows) {
      const kGoal = await this.keyStore.getAggregateKey(row.aggregate_id);
      if (!kGoal) continue;
      const snapshot = await this.decryptSnapshot(
        row.aggregate_id,
        row.payload_encrypted,
        row.version,
        kGoal
      );
      if (!snapshot || snapshot.archivedAt !== null) continue;
      this.snapshots.set(row.aggregate_id, snapshot);
      this.projections.set(row.aggregate_id, snapshotToListItem(snapshot));
    }
    const restored = await this.loadSearchIndex(searchKey);
    if (!restored) {
      this.rebuildSearchIndexFromProjections();
      await this.saveSearchIndex(searchKey, this.lastSequence, Date.now());
    }
  }

  private async loadSnapshot(
    aggregateId: string,
    kGoal: Uint8Array
  ): Promise<GoalSnapshotState | null> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT payload_encrypted, version, last_sequence FROM goal_snapshots WHERE aggregate_id = ?',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    const row = rows[0];
    return this.decryptSnapshot(
      aggregateId,
      row.payload_encrypted,
      row.version,
      kGoal
    );
  }

  private async decryptSnapshot(
    aggregateId: string,
    cipher: Uint8Array,
    version: number,
    kGoal: Uint8Array
  ): Promise<GoalSnapshotState | null> {
    const aad = new TextEncoder().encode(`${aggregateId}:snapshot:${version}`);
    const plaintext = await this.crypto.decrypt(cipher, kGoal, aad);
    return JSON.parse(new TextDecoder().decode(plaintext)) as GoalSnapshotState;
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: GoalSnapshotState,
    kGoal: Uint8Array,
    event: EncryptedEvent
  ): Promise<void> {
    const aad = new TextEncoder().encode(
      `${aggregateId}:snapshot:${snapshot.version}`
    );
    const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const cipher = await this.crypto.encrypt(payloadBytes, kGoal, aad);

    this.store.query({
      query: `
        INSERT INTO goal_snapshots (aggregate_id, payload_encrypted, version, last_sequence, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(aggregate_id) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          version = excluded.version,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        aggregateId,
        cipher as Uint8Array<ArrayBuffer>,
        snapshot.version,
        event.sequence ?? 0,
        event.occurredAt,
      ],
    });
  }

  private async updateAnalytics(
    event: import('@mo/domain').DomainEvent,
    previous: GoalSnapshotState | null,
    next: GoalSnapshotState | null,
    sequence?: number,
    occurredAt?: number
  ): Promise<void> {
    const analyticsKey = await this.ensureAnalyticsKey();
    const current = await this.loadAnalytics(analyticsKey);
    const deltas = buildAnalyticsDeltas(previous, next);
    const updated = applyAnalyticsDeltas(current, deltas);
    await this.saveAnalytics(
      updated,
      analyticsKey,
      sequence ?? 0,
      occurredAt ?? event.occurredAt.value
    );
    this.analyticsCache = updated;
  }

  private async ensureAnalyticsKey(): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(
      ANALYTICS_AGGREGATE_ID
    );
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(ANALYTICS_AGGREGATE_ID, generated);
    return generated;
  }

  private async loadAnalytics(key: Uint8Array): Promise<AnalyticsPayload> {
    if (this.analyticsCache) return this.analyticsCache;
    const rows = this.store.query<AnalyticsRow[]>({
      query:
        'SELECT payload_encrypted, last_sequence FROM goal_analytics WHERE aggregate_id = ?',
      bindValues: [ANALYTICS_AGGREGATE_ID],
    });
    if (!rows.length) return createEmptyAnalytics();
    const row = rows[0];
    const aad = new TextEncoder().encode(
      `${ANALYTICS_AGGREGATE_ID}:analytics:${row.last_sequence}`
    );
    const plaintext = await this.crypto.decrypt(
      row.payload_encrypted,
      key,
      aad
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as AnalyticsPayload;
  }

  private async saveAnalytics(
    analytics: AnalyticsPayload,
    key: Uint8Array,
    lastSequence: number,
    occurredAtMs: number
  ): Promise<void> {
    const aad = new TextEncoder().encode(
      `${ANALYTICS_AGGREGATE_ID}:analytics:${lastSequence}`
    );
    const payloadBytes = new TextEncoder().encode(JSON.stringify(analytics));
    const cipher = await this.crypto.encrypt(payloadBytes, key, aad);

    this.store.query({
      query: `
        INSERT INTO goal_analytics (aggregate_id, payload_encrypted, last_sequence, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(aggregate_id) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        ANALYTICS_AGGREGATE_ID,
        cipher as Uint8Array<ArrayBuffer>,
        lastSequence,
        occurredAtMs,
      ],
    });
  }

  private async ensureSearchKey(): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(SEARCH_INDEX_KEY);
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(SEARCH_INDEX_KEY, generated);
    return generated;
  }

  private async loadSearchIndex(key: Uint8Array): Promise<boolean> {
    const rows = this.store.query<SearchIndexRow[]>({
      query:
        'SELECT payload_encrypted, last_sequence FROM goal_search_index WHERE key = ?',
      bindValues: [SEARCH_INDEX_KEY],
    });
    if (!rows.length) return false;
    const row = rows[0];
    const aad = new TextEncoder().encode(
      `${SEARCH_INDEX_KEY}:fts:${row.last_sequence}`
    );
    const plaintext = await this.crypto.decrypt(
      row.payload_encrypted,
      key,
      aad
    );
    const json = new TextDecoder().decode(plaintext);
    this.searchIndex = MiniSearch.loadJSON<GoalListItem>(JSON.parse(json), {
      idField: this.searchConfig.idField,
      fields: [...this.searchConfig.fields],
      storeFields: [...this.searchConfig.storeFields],
      searchOptions: this.searchConfig.searchOptions,
    });
    return true;
  }

  private async saveSearchIndex(
    key: Uint8Array,
    lastSequence: number,
    updatedAtMs: number
  ): Promise<void> {
    const serialized = JSON.stringify(this.searchIndex.toJSON());
    const aad = new TextEncoder().encode(
      `${SEARCH_INDEX_KEY}:fts:${lastSequence}`
    );
    const cipher = await this.crypto.encrypt(
      new TextEncoder().encode(serialized),
      key,
      aad
    );
    this.store.query({
      query: `
        INSERT INTO goal_search_index (key, payload_encrypted, last_sequence, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          payload_encrypted = excluded.payload_encrypted,
          last_sequence = excluded.last_sequence,
          updated_at = excluded.updated_at
      `,
      bindValues: [
        SEARCH_INDEX_KEY,
        cipher as Uint8Array<ArrayBuffer>,
        lastSequence,
        updatedAtMs,
      ],
    });
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

  private updateProjectionCache(
    aggregateId: string,
    snapshot: GoalSnapshotState | null
  ): void {
    const existing = this.projections.get(aggregateId) ?? null;
    if (!snapshot || snapshot.archivedAt !== null) {
      this.snapshots.delete(aggregateId);
      this.projections.delete(aggregateId);
      if (existing) {
        try {
          this.searchIndex.remove(existing);
        } catch {
          // Missing is fine.
        }
      }
      return;
    }
    this.snapshots.set(aggregateId, snapshot);
    const listItem = snapshotToListItem(snapshot);
    this.projections.set(aggregateId, listItem);
    const toRemove = existing ?? listItem;
    try {
      this.searchIndex.remove(toRemove);
    } catch {
      // Not present yet; ignore.
    }
    this.searchIndex.add(listItem);
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

  private pruneProcessedEvents(processedUpTo: number): void {
    if (!Number.isFinite(processedUpTo) || processedUpTo <= 0) return;
    this.store.query({
      query: 'DELETE FROM goal_events WHERE sequence <= ?',
      bindValues: [processedUpTo],
    });
  }

  private matchesFilter(
    item: GoalListItem,
    filter?: { slice?: string; month?: string; priority?: string }
  ): boolean {
    if (!filter) return true;
    if (filter.slice && item.slice !== filter.slice) return false;
    if (filter.priority && item.priority !== filter.priority) return false;
    if (filter.month && item.targetMonth !== filter.month) return false;
    return true;
  }

  private rebuildSearchIndexFromProjections(): void {
    this.searchIndex = this.createSearchIndex();
    const docs = [...this.projections.values()].filter(
      (item) => item.archivedAt === null
    );
    if (docs.length > 0) {
      this.searchIndex.addAll(docs);
    }
  }
}

const applyAnalyticsDeltas = (
  analytics: AnalyticsPayload,
  deltas: AnalyticsDelta
): AnalyticsPayload => {
  let monthlyTotals = analytics.monthlyTotals;
  let categoryRollups = analytics.categoryRollups;
  deltas.monthly.forEach(({ yearMonth, slice, delta }) => {
    monthlyTotals = applyMonthlyDelta(monthlyTotals, yearMonth, slice, delta);
  });
  deltas.category.forEach(({ year, slice, delta }) => {
    categoryRollups = applyCategoryDelta(categoryRollups, year, slice, delta);
  });
  return { monthlyTotals, categoryRollups };
};
