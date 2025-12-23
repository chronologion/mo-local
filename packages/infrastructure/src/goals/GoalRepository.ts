import { Goal, GoalId, Timestamp } from '@mo/domain';
import type { GoalSnapshot } from '@mo/domain';
import {
  ConcurrencyError,
  IEventStore,
  IGoalRepository,
} from '@mo/application';
import type { Store } from '@livestore/livestore';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { MissingKeyError, PersistenceError } from '../errors';
import { decodeGoalSnapshotDomain } from './snapshots/GoalSnapshotCodec';
import { buildSnapshotAad } from '../eventing/aad';

/**
 * Browser-friendly goal repository that uses async adapters with encryption.
 */
export class GoalRepository implements IGoalRepository {
  private readonly toEncrypted: DomainToLiveStoreAdapter;
  private readonly toDomain: LiveStoreToDomainAdapter;

  constructor(
    private readonly eventStore: IEventStore,
    private readonly store: Store,
    private readonly crypto: WebCryptoService,
    private readonly keyProvider: (
      aggregateId: string
    ) => Promise<Uint8Array | null>
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async load(id: GoalId): Promise<Goal | null> {
    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }

    const snapshot = await this.loadSnapshot(id.value, kGoal);
    const fromVersion = snapshot ? snapshot.version + 1 : 1;
    const tailEvents = await this.eventStore.getEvents(id.value, fromVersion);
    if (!snapshot && tailEvents.length === 0) return null;

    const domainTail = await Promise.all(
      tailEvents.map((event) => this.toDomain.toDomain(event, kGoal))
    );

    if (snapshot) {
      return Goal.reconstituteFromSnapshot(snapshot, domainTail);
    }
    return Goal.reconstitute(id, domainTail);
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    const pending = goal.getUncommittedEvents();
    if (pending.length === 0) return;

    const snapshot = await this.loadSnapshot(goal.id.value, encryptionKey);
    const eventVersionRows = this.store.query<{ version: number | null }[]>({
      query:
        'SELECT MAX(version) as version FROM goal_events WHERE aggregate_id = ?',
      bindValues: [goal.id.value],
    });
    const maxEventVersion = Number(eventVersionRows[0]?.version ?? 0);
    const baseVersion = Math.max(maxEventVersion, snapshot?.version ?? 0);
    const startVersion = baseVersion + 1;

    try {
      const encrypted = await Promise.all(
        pending.map((event, idx) =>
          this.toEncrypted.toEncrypted(
            event as never,
            startVersion + idx,
            encryptionKey
          )
        )
      );
      await this.eventStore.append(goal.id.value, encrypted);
      goal.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof ConcurrencyError) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown persistence error';
      throw new PersistenceError(
        `Failed to save goal ${goal.id.value}: ${message}`
      );
    }
  }

  private async loadSnapshot(
    aggregateId: string,
    kGoal: Uint8Array
  ): Promise<GoalSnapshot | null> {
    const rows = this.store.query<
      { payload_encrypted: Uint8Array; version: number }[]
    >({
      query:
        'SELECT payload_encrypted, version FROM goal_snapshots WHERE aggregate_id = ? LIMIT 1',
      bindValues: [aggregateId],
    });
    if (!rows.length) return null;
    const row = rows[0];
    const aad = buildSnapshotAad(aggregateId, row.version);
    const plaintext = await this.crypto.decrypt(
      row.payload_encrypted,
      kGoal,
      aad
    );
    return decodeGoalSnapshotDomain(plaintext, row.version);
  }

  async archive(id: GoalId, archivedAt: Timestamp): Promise<void> {
    const goal = await this.load(id);
    if (!goal) return;
    goal.archive(archivedAt);
    const kGoal = await this.keyProvider(id.value);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }
    await this.save(goal, kGoal);
  }
}
