import type { IEventStore } from '@mo/application';
import type { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import type { IndexedDBKeyStore } from '../crypto/IndexedDBKeyStore';
import { MissingKeyError } from '../errors';
import { WebCryptoService } from '../crypto/WebCryptoService';
import {
  applyEventToSnapshot,
  type GoalListItem,
  type GoalSnapshotState,
  type SupportedGoalEvent,
  snapshotToListItem,
} from './GoalProjectionState';

type SnapshotRow = {
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  updated_at: number;
  last_sequence: number;
};

/**
 * Goal queries backed primarily by encrypted snapshots, with per-aggregate tail replay
 * to avoid staleness when the projector lags.
 */
export class GoalQueries {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly toDomain: LiveStoreToDomainAdapter,
    private readonly keyStore: IndexedDBKeyStore,
    private readonly crypto: WebCryptoService,
    private readonly storeQuery: <T>(params: {
      query: string;
      bindValues: Array<string | number | Uint8Array>;
    }) => T
  ) {}

  async listGoals(): Promise<GoalListItem[]> {
    const snapshotRows = this.fetchSnapshotRows();
    const snapshotByAggregate = new Map<string, SnapshotRow>();
    snapshotRows.forEach((row) =>
      snapshotByAggregate.set(row.aggregate_id, row)
    );

    const aggregates = this.storeQuery<{ aggregate_id: string }[]>({
      query: 'SELECT DISTINCT aggregate_id FROM goal_events',
      bindValues: [],
    });

    const snapshots: GoalSnapshotState[] = [];
    for (const { aggregate_id } of aggregates) {
      const row = snapshotByAggregate.get(aggregate_id);
      const current = row
        ? await this.buildCurrentFromSnapshotRow(row)
        : await this.replayAggregate(aggregate_id);
      if (current && current.deletedAt === null) {
        snapshots.push(current);
      }
    }

    return snapshots
      .map(snapshotToListItem)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getGoalById(goalId: string): Promise<GoalListItem | null> {
    const rows = this.storeQuery<SnapshotRow[]>({
      query: `
        SELECT aggregate_id, payload_encrypted, version, updated_at, last_sequence
        FROM goal_snapshots
        WHERE aggregate_id = ?
        LIMIT 1
      `,
      bindValues: [goalId],
    });

    let snapshot = null as GoalSnapshotState | null;
    if (rows.length) {
      snapshot = await this.buildCurrentFromSnapshotRow(rows[0] as SnapshotRow);
    } else {
      snapshot = await this.replayAggregate(goalId);
    }

    if (!snapshot || snapshot.deletedAt !== null) return null;
    return snapshotToListItem(snapshot);
  }

  private fetchSnapshotRows(): SnapshotRow[] {
    return this.storeQuery<SnapshotRow[]>({
      query: `
        SELECT aggregate_id, payload_encrypted, version, updated_at, last_sequence
        FROM goal_snapshots
        ORDER BY updated_at DESC
      `,
      bindValues: [],
    });
  }

  private async buildCurrentFromSnapshotRow(
    row: SnapshotRow
  ): Promise<GoalSnapshotState | null> {
    const base = await this.decryptSnapshot(
      row.aggregate_id,
      row.payload_encrypted,
      row.version
    );
    if (!base) return null;

    const tailEvents = await this.eventStore.getAllEvents({
      aggregateId: row.aggregate_id,
      since: row.last_sequence,
    });
    if (tailEvents.length === 0) {
      return base;
    }

    const kGoal = await this.requireKey(row.aggregate_id);
    const domainEvents = (await this.toDomain.toDomainBatch(
      tailEvents,
      kGoal
    )) as SupportedGoalEvent[];

    let current: GoalSnapshotState | null = base;
    let currentVersion = base.version;
    for (let idx = 0; idx < domainEvents.length; idx += 1) {
      const event = domainEvents[idx]!;
      const version = tailEvents[idx]?.version ?? currentVersion + 1;
      current = applyEventToSnapshot(current, event, version);
      currentVersion = version;
    }
    return current;
  }

  private async replayAggregate(
    aggregateId: string
  ): Promise<GoalSnapshotState | null> {
    const events = await this.eventStore.getEvents(aggregateId);
    if (events.length === 0) return null;
    const kGoal = await this.requireKey(aggregateId);
    const domainEvents = (await this.toDomain.toDomainBatch(
      events,
      kGoal
    )) as SupportedGoalEvent[];

    let snapshot: GoalSnapshotState | null = null;
    let currentVersion = 0;
    for (let idx = 0; idx < domainEvents.length; idx += 1) {
      const event = domainEvents[idx]!;
      const version = events[idx]?.version ?? currentVersion + 1;
      snapshot = applyEventToSnapshot(snapshot, event, version);
      currentVersion = version;
    }
    return snapshot;
  }

  private async decryptSnapshot(
    aggregateId: string,
    cipher: Uint8Array,
    version: number
  ): Promise<GoalSnapshotState | null> {
    const kGoal = await this.requireKey(aggregateId);
    const aad = new TextEncoder().encode(`${aggregateId}:snapshot:${version}`);
    const plaintext = await this.crypto.decrypt(cipher, kGoal, aad);
    return JSON.parse(new TextDecoder().decode(plaintext)) as GoalSnapshotState;
  }

  private async requireKey(aggregateId: string): Promise<Uint8Array> {
    const kGoal = await this.keyStore.getAggregateKey(aggregateId);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${aggregateId}`);
    }
    return kGoal;
  }
}
