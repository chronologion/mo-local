import type { EffectiveCursor } from '@mo/eventstore-core';
import { ProjectionOrderings } from '@mo/eventstore-core';
import type { KeyStorePort } from '@mo/application';
import type { WebCryptoService } from '../../crypto/WebCryptoService';
import { AnalyticsDelta, buildAnalyticsDeltas } from '../projections/model/GoalProjectionState';
import type { GoalSnapshotState } from '../projections/model/GoalProjectionState';
import { AnalyticsPayload, applyCategoryDelta, applyMonthlyDelta, createEmptyAnalytics } from './GoalAnalyticsState';
import { buildProjectionCacheAad, ProjectionCacheStore } from '../../platform/derived-state';

const PROJECTION_ID = 'goal_analytics';
const ANALYTICS_SCOPE = 'global';
const ANALYTICS_KEY_ID = 'goal_analytics';
const ANALYTICS_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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

const applyAnalyticsDeltas = (analytics: AnalyticsPayload, deltas: AnalyticsDelta): AnalyticsPayload => {
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

export class GoalAnalyticsProjector {
  private analyticsCache: AnalyticsPayload | null = null;

  constructor(
    private readonly cacheStore: ProjectionCacheStore,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {}

  clearCache(): void {
    this.analyticsCache = null;
  }

  async updateAnalytics(
    previous: GoalSnapshotState | null,
    next: GoalSnapshotState | null,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<void> {
    const analyticsKey = await this.ensureAnalyticsKey();
    const current = await this.loadAnalytics(analyticsKey);
    const deltas = buildAnalyticsDeltas(previous, next);
    const updated = applyAnalyticsDeltas(current, deltas);
    await this.saveAnalytics(analyticsKey, updated, cursor, lastCommitSequence);
    this.analyticsCache = updated;
  }

  async clearPersisted(): Promise<void> {
    await this.cacheStore.remove(PROJECTION_ID, ANALYTICS_SCOPE);
  }

  private async ensureAnalyticsKey(): Promise<Uint8Array> {
    const existing = await this.keyStore.getAggregateKey(ANALYTICS_KEY_ID);
    if (existing) return existing;
    const generated = await this.crypto.generateKey();
    await this.keyStore.saveAggregateKey(ANALYTICS_KEY_ID, generated);
    return generated;
  }

  private async loadAnalytics(key: Uint8Array): Promise<AnalyticsPayload> {
    if (this.analyticsCache) return this.analyticsCache;
    const row = await this.cacheStore.get(PROJECTION_ID, ANALYTICS_SCOPE);
    if (!row) return createEmptyAnalytics();
    const aad = buildProjectionCacheAad(PROJECTION_ID, ANALYTICS_SCOPE, row.cacheVersion, row.lastEffectiveCursor);
    const plaintext = await this.crypto.decrypt(row.cacheEncrypted, key, aad);
    return parseAnalyticsPayload(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  private async saveAnalytics(
    key: Uint8Array,
    analytics: AnalyticsPayload,
    cursor: EffectiveCursor,
    lastCommitSequence: number
  ): Promise<void> {
    const aad = buildProjectionCacheAad(PROJECTION_ID, ANALYTICS_SCOPE, ANALYTICS_VERSION, cursor);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(analytics));
    const cipher = await this.crypto.encrypt(payloadBytes, key, aad);
    await this.cacheStore.put({
      projectionId: PROJECTION_ID,
      scopeKey: ANALYTICS_SCOPE,
      cacheVersion: ANALYTICS_VERSION,
      cacheEncrypted: cipher,
      ordering: ProjectionOrderings.effectiveTotalOrder,
      lastEffectiveCursor: cursor,
      lastCommitSequence,
      writtenAt: Date.now(),
    });
  }
}
