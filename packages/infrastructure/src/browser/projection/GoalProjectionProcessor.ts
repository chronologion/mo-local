import { EncryptedEvent, IEventStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import { IndexedDBKeyStore } from '../../crypto/IndexedDBKeyStore';
import { WebCryptoService } from '../../crypto/WebCryptoService';
import { MissingKeyError } from '../../errors';
import { tables } from '../schema';
import { LiveStoreToDomainAdapter } from '../../livestore/adapters/LiveStoreToDomainAdapter';
import {
  AnalyticsDelta,
  GoalSnapshotState,
  applyEventToSnapshot,
  buildAnalyticsDeltas,
  SupportedGoalEvent,
} from '../GoalProjectionState';
import {
  AnalyticsPayload,
  applyCategoryDelta,
  applyMonthlyDelta,
  createEmptyAnalytics,
} from './GoalAnalyticsState';

const META_LAST_SEQUENCE_KEY = 'last_sequence';
const ANALYTICS_AGGREGATE_ID = 'goal_analytics';

type SnapshotRow = {
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
};

type AnalyticsRow = {
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

  constructor(
    private readonly store: Store,
    private readonly eventStore: IEventStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IndexedDBKeyStore,
    private readonly toDomain: LiveStoreToDomainAdapter
  ) {}

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
    await this.processNewEvents();
    this.unsubscribe = this.store.subscribe(tables.goal_events.count(), () => {
      void this.processNewEvents();
    });
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
    for (const event of events) {
      try {
        await this.projectEvent(event);
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
    }
  }

  private async projectEvent(event: EncryptedEvent): Promise<void> {
    if (!event.sequence) {
      throw new Error(`Event ${event.id} missing sequence`);
    }

    const kGoal = await this.keyStore.getAggregateKey(event.aggregateId);
    if (!kGoal) {
      throw new MissingKeyError(
        `Missing aggregate key for ${event.aggregateId}`
      );
    }

    const domainEvent = (await this.toDomain.toDomain(
      event,
      kGoal
    )) as SupportedGoalEvent;
    const previousSnapshot = await this.loadSnapshot(event.aggregateId, kGoal);
    const nextSnapshot = applyEventToSnapshot(
      previousSnapshot,
      domainEvent,
      event.version
    );
    if (!nextSnapshot) {
      // No snapshot to write (e.g., create missing); skip.
      return;
    }

    await this.saveSnapshot(event.aggregateId, nextSnapshot, kGoal, event);
    await this.updateAnalytics(
      domainEvent,
      previousSnapshot,
      nextSnapshot,
      event.sequence,
      event.occurredAt
    );
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
    const aad = new TextEncoder().encode(
      `${aggregateId}:snapshot:${row.version}`
    );
    const plaintext = await this.crypto.decrypt(
      row.payload_encrypted,
      kGoal,
      aad
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(plaintext)
    ) as GoalSnapshotState;
    return parsed;
  }

  private async saveSnapshot(
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
    event: SupportedGoalEvent,
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
      occurredAt ?? event.occurredAt.getTime()
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
