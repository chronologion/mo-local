import type { IKeyStore } from '@mo/application';
import type { Store } from '@livestore/livestore';
import type { DomainEvent } from '@mo/domain';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import {
  AnalyticsDelta,
  GoalSnapshotState,
  buildAnalyticsDeltas,
} from '../model/GoalProjectionState';
import {
  AnalyticsPayload,
  applyCategoryDelta,
  applyMonthlyDelta,
  createEmptyAnalytics,
} from './GoalAnalyticsState';

const ANALYTICS_AGGREGATE_ID = 'goal_analytics';

type AnalyticsRow = {
  payload_encrypted: Uint8Array;
  last_sequence: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseAnalyticsPayload = (value: unknown): AnalyticsPayload => {
  if (!isRecord(value)) {
    throw new Error('Analytics payload must be an object');
  }
  const { monthlyTotals, categoryRollups } = value;
  if (!isRecord(monthlyTotals) || !isRecord(categoryRollups)) {
    throw new Error('Analytics payload shape is invalid');
  }
  return {
    monthlyTotals: monthlyTotals as AnalyticsPayload['monthlyTotals'],
    categoryRollups: categoryRollups as AnalyticsPayload['categoryRollups'],
  };
};

export class GoalAnalyticsProjector {
  private analyticsCache: AnalyticsPayload | null = null;

  constructor(
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IKeyStore
  ) {}

  clearCache(): void {
    this.analyticsCache = null;
  }

  async updateAnalytics(
    event: DomainEvent,
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
    return parseAnalyticsPayload(
      JSON.parse(new TextDecoder().decode(plaintext))
    );
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
