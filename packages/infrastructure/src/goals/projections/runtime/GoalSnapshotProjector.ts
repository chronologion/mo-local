import type { KeyStorePort } from '@mo/application';
import type { Store } from '@livestore/livestore';
import type { EncryptedEvent } from '@mo/application';
import { MissingKeyError } from '../../../errors';
import { buildSnapshotAad } from '../../../eventing/aad';
import {
  decodeGoalSnapshotState,
  encodeGoalSnapshotState,
} from '../../snapshots/GoalSnapshotCodec';
import {
  GoalSnapshotState,
  applyEventToSnapshot,
  snapshotToListItem,
  type GoalEvent,
  type GoalListItem,
} from '../model/GoalProjectionState';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';

type SnapshotRow = {
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

type SnapshotApplyResult = {
  changed: boolean;
  previous: GoalSnapshotState | null;
  next: GoalSnapshotState | null;
  previousItem: GoalListItem | null;
  nextItem: GoalListItem | null;
};

export class GoalSnapshotProjector {
  private readonly snapshots = new Map<string, GoalSnapshotState>();
  private readonly projections = new Map<string, GoalListItem>();

  constructor(
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort
  ) {}

  listProjections(): GoalListItem[] {
    return [...this.projections.values()];
  }

  getProjectionsMap(): Map<string, GoalListItem> {
    return this.projections;
  }

  getProjection(aggregateId: string): GoalListItem | null {
    return this.projections.get(aggregateId) ?? null;
  }

  getSnapshot(aggregateId: string): GoalSnapshotState | null {
    return this.snapshots.get(aggregateId) ?? null;
  }

  clearCaches(): void {
    this.snapshots.clear();
    this.projections.clear();
  }

  async bootstrapFromSnapshots(): Promise<void> {
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
  }

  async applyEvent(
    event: EncryptedEvent,
    domainEvent: GoalEvent,
    key: Uint8Array
  ): Promise<SnapshotApplyResult> {
    const previousSnapshot =
      this.snapshots.get(event.aggregateId) ??
      (await this.loadSnapshot(event.aggregateId, key));
    const previousItem =
      this.projections.get(event.aggregateId) ??
      (previousSnapshot ? snapshotToListItem(previousSnapshot) : null);
    const nextVersion = previousSnapshot ? previousSnapshot.version + 1 : 1;
    const nextSnapshot = applyEventToSnapshot(
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

    await this.persistSnapshot(event.aggregateId, nextSnapshot, key, event);
    this.snapshots.set(event.aggregateId, nextSnapshot);

    if (nextSnapshot.archivedAt === null) {
      const nextItem = snapshotToListItem(nextSnapshot);
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
    try {
      return await this.decryptSnapshot(
        aggregateId,
        row.payload_encrypted,
        row.version,
        kGoal
      );
    } catch {
      // No backward-compat: treat unreadable snapshots as corrupt, purge, and rebuild from events.
      this.store.query({
        query: 'DELETE FROM goal_snapshots WHERE aggregate_id = ?',
        bindValues: [aggregateId],
      });
      return null;
    }
  }

  private async decryptSnapshot(
    aggregateId: string,
    cipher: Uint8Array,
    version: number,
    kGoal: Uint8Array
  ): Promise<GoalSnapshotState | null> {
    const aad = buildSnapshotAad(aggregateId, version);
    const plaintext = await this.crypto.decrypt(cipher, kGoal, aad);
    return decodeGoalSnapshotState(plaintext, version);
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: GoalSnapshotState,
    kGoal: Uint8Array,
    event: EncryptedEvent
  ): Promise<void> {
    const aad = buildSnapshotAad(aggregateId, snapshot.version);
    const cipher = await this.crypto.encrypt(
      encodeGoalSnapshotState(snapshot),
      kGoal,
      aad
    );

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

  async requireAggregateKey(aggregateId: string): Promise<Uint8Array> {
    const key = await this.keyStore.getAggregateKey(aggregateId);
    if (!key) {
      throw new MissingKeyError(`Missing aggregate key for ${aggregateId}`);
    }
    return key;
  }
}
