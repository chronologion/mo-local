import type { Store } from '@livestore/livestore';
import type { IKeyStore, EncryptedEvent } from '@mo/application';
import type { WebCryptoService } from '../../../crypto/WebCryptoService';
import { MissingKeyError } from '../../../errors';
import { buildSnapshotAad } from '../../../eventing/aad';
import {
  applyProjectEventToSnapshot,
  projectSnapshotToListItem,
  type ProjectListItem,
  type ProjectSnapshotState,
  type SupportedProjectEvent,
} from '../model/ProjectProjectionState';
import {
  decodeProjectSnapshotState,
  encodeProjectSnapshotState,
} from '../../snapshots/ProjectSnapshotCodec';

type SnapshotRow = {
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  last_sequence: number;
  updated_at: number;
};

type SnapshotApplyResult = {
  changed: boolean;
  previous: ProjectSnapshotState | null;
  next: ProjectSnapshotState | null;
  previousItem: ProjectListItem | null;
  nextItem: ProjectListItem | null;
};

export class ProjectSnapshotProjector {
  private readonly snapshots = new Map<string, ProjectSnapshotState>();
  private readonly projections = new Map<string, ProjectListItem>();

  constructor(
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: IKeyStore
  ) {}

  listProjections(): ProjectListItem[] {
    return [...this.projections.values()];
  }

  getProjection(aggregateId: string): ProjectListItem | null {
    return this.projections.get(aggregateId) ?? null;
  }

  getProjectionsMap(): Map<string, ProjectListItem> {
    return this.projections;
  }

  clearCaches(): void {
    this.snapshots.clear();
    this.projections.clear();
  }

  async bootstrapFromSnapshots(): Promise<void> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT aggregate_id, payload_encrypted, version, last_sequence, updated_at FROM project_snapshots',
      bindValues: [],
    });
    for (const row of rows) {
      const kProject = await this.keyStore.getAggregateKey(row.aggregate_id);
      if (!kProject) continue;
      const snapshot = await this.decryptSnapshot(
        row.aggregate_id,
        row.payload_encrypted,
        row.version,
        kProject
      );
      if (!snapshot || snapshot.archivedAt !== null) continue;
      this.snapshots.set(row.aggregate_id, snapshot);
      this.projections.set(
        row.aggregate_id,
        projectSnapshotToListItem(snapshot)
      );
    }
  }

  async applyEvent(
    event: EncryptedEvent,
    domainEvent: SupportedProjectEvent,
    key: Uint8Array
  ): Promise<SnapshotApplyResult> {
    const previousSnapshot =
      this.snapshots.get(event.aggregateId) ??
      (await this.loadSnapshot(event.aggregateId, key));
    const previousItem =
      this.projections.get(event.aggregateId) ??
      (previousSnapshot ? projectSnapshotToListItem(previousSnapshot) : null);
    const nextSnapshot = applyProjectEventToSnapshot(
      previousSnapshot,
      domainEvent,
      event.version
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
      const nextItem = projectSnapshotToListItem(nextSnapshot);
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

  async requireAggregateKey(aggregateId: string): Promise<Uint8Array> {
    const key = await this.keyStore.getAggregateKey(aggregateId);
    if (!key) {
      throw new MissingKeyError(`Missing aggregate key for ${aggregateId}`);
    }
    return key;
  }

  private async loadSnapshot(
    aggregateId: string,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const rows = this.store.query<SnapshotRow[]>({
      query:
        'SELECT payload_encrypted, version FROM project_snapshots WHERE aggregate_id = ?',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    try {
      return await this.decryptSnapshot(
        aggregateId,
        rows[0]?.payload_encrypted ?? new Uint8Array(),
        rows[0]?.version ?? 0,
        key
      );
    } catch {
      // No backward-compat: treat unreadable snapshots as corrupt, purge, and rebuild from events.
      this.store.query({
        query: 'DELETE FROM project_snapshots WHERE aggregate_id = ?',
        bindValues: [aggregateId],
      });
      return null;
    }
  }

  private async decryptSnapshot(
    aggregateId: string,
    payload: Uint8Array,
    version: number,
    key: Uint8Array
  ): Promise<ProjectSnapshotState | null> {
    const aad = buildSnapshotAad(aggregateId, version);
    const plaintext = await this.crypto.decrypt(payload, key, aad);
    return decodeProjectSnapshotState(plaintext, version);
  }

  private async persistSnapshot(
    aggregateId: string,
    snapshot: ProjectSnapshotState,
    key: Uint8Array,
    event: EncryptedEvent
  ): Promise<void> {
    const aad = buildSnapshotAad(aggregateId, event.version);
    const cipher = await this.crypto.encrypt(
      encodeProjectSnapshotState(snapshot),
      key,
      aad
    );
    this.store.query({
      query: `
        INSERT INTO project_snapshots (aggregate_id, payload_encrypted, version, last_sequence, updated_at)
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
        event.version,
        event.sequence ?? 0,
        event.occurredAt,
      ],
    });
  }
}
