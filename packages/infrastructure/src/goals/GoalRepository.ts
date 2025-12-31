import { Goal, GoalId, Timestamp, UserId, goalEventTypes } from '@mo/domain';
import type { GoalSnapshot } from '@mo/domain';
import {
  ConcurrencyError,
  EventStorePort,
  GoalRepositoryPort,
  KeyStorePort,
  none,
  Option,
  some,
} from '@mo/application';
import type { SqliteDbPort } from '@mo/eventstore-web';
import { AggregateTypes } from '@mo/eventstore-core';
import { DomainToEncryptedEventAdapter } from '../eventstore/adapters/DomainToEncryptedEventAdapter';
import { EncryptedEventToDomainAdapter } from '../eventstore/adapters/EncryptedEventToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { KeyringManager } from '../crypto/KeyringManager';
import { MissingKeyError, PersistenceError } from '../errors';
import { decodeGoalSnapshotDomain } from './snapshots/GoalSnapshotCodec';
import { buildSnapshotAad } from '../eventing/aad';
import {
  SqliteSnapshotStore,
  type SnapshotStore,
} from '../eventstore/persistence/SnapshotStore';

/**
 * Browser-friendly goal repository that uses async adapters with encryption.
 */
export class GoalRepository implements GoalRepositoryPort {
  private readonly toEncrypted: DomainToEncryptedEventAdapter;
  private readonly toDomain: EncryptedEventToDomainAdapter;
  private readonly snapshotStore: SnapshotStore;

  constructor(
    private readonly eventStore: EventStorePort,
    private readonly db: SqliteDbPort,
    private readonly crypto: WebCryptoService,
    private readonly keyStore: KeyStorePort,
    private readonly keyringManager: KeyringManager,
    snapshotStore: SnapshotStore = new SqliteSnapshotStore()
  ) {
    this.toEncrypted = new DomainToEncryptedEventAdapter(crypto);
    this.toDomain = new EncryptedEventToDomainAdapter(crypto);
    this.snapshotStore = snapshotStore;
  }

  async load(id: GoalId): Promise<Option<Goal>> {
    const snapshotKey = await this.keyStore.getAggregateKey(id.value);
    const loadedSnapshot = snapshotKey
      ? await this.loadSnapshot(id.value, snapshotKey)
      : null;
    const tailEvents = loadedSnapshot
      ? await this.eventStore.getEvents(
          id.value,
          loadedSnapshot.snapshot.version + 1
        )
      : await this.eventStore.getEvents(id.value, 1);
    if (!loadedSnapshot && tailEvents.length === 0) return none();

    const domainTail = [];
    for (const event of tailEvents) {
      const key = await this.keyringManager.resolveKeyForEvent(event);
      domainTail.push(await this.toDomain.toDomain(event, key));
    }

    if (loadedSnapshot) {
      return some(
        Goal.reconstituteFromSnapshot(loadedSnapshot.snapshot, domainTail)
      );
    }
    return some(Goal.reconstitute(id, domainTail));
  }

  async save(goal: Goal, encryptionKey: Uint8Array): Promise<void> {
    const pending = goal.getUncommittedEvents();
    if (pending.length === 0) return;

    const snapshot = await this.loadSnapshot(goal.id.value, encryptionKey);
    const eventVersionRows = await this.db.query<
      Readonly<{ version: number | null }>
    >(
      `
        SELECT MAX(version) as version
        FROM events
        WHERE aggregate_type = ? AND aggregate_id = ?
      `,
      [AggregateTypes.goal, goal.id.value]
    );
    const maxEventVersion = Number(eventVersionRows[0]?.version ?? 0);
    const baseVersion = Math.max(
      maxEventVersion,
      snapshot?.snapshot.version ?? 0
    );
    const startVersion = baseVersion + 1;

    try {
      const encrypted = [];
      for (let idx = 0; idx < pending.length; idx += 1) {
        const event = pending[idx];
        if (!event) continue;
        const options = await this.buildEncryptionOptions(
          event.eventType,
          event.aggregateId.value,
          event.occurredAt.value,
          encryptionKey
        );
        encrypted.push(
          await this.toEncrypted.toEncrypted(
            event,
            startVersion + idx,
            encryptionKey,
            options
          )
        );
      }
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
  ): Promise<{ snapshot: GoalSnapshot } | null> {
    const record = await this.snapshotStore.get(
      this.db,
      { table: 'events', aggregateType: AggregateTypes.goal },
      aggregateId
    );
    if (!record) return null;
    const aad = buildSnapshotAad(aggregateId, record.snapshotVersion);
    const plaintext = await this.crypto.decrypt(
      record.snapshotEncrypted,
      kGoal,
      aad
    );
    return {
      snapshot: decodeGoalSnapshotDomain(plaintext, record.snapshotVersion),
    };
  }

  async archive(
    id: GoalId,
    archivedAt: Timestamp,
    actorId: UserId
  ): Promise<void> {
    const goal = await this.load(id);
    if (goal.kind === 'none') return;
    goal.value.archive({ archivedAt, actorId });
    const kGoal = await this.keyStore.getAggregateKey(id.value);
    if (!kGoal) {
      throw new MissingKeyError(`Missing encryption key for ${id.value}`);
    }
    await this.save(goal.value, kGoal);
  }

  private async buildEncryptionOptions(
    eventType: string,
    aggregateId: string,
    occurredAt: number,
    encryptionKey: Uint8Array
  ): Promise<{ epoch?: number; keyringUpdate?: Uint8Array } | undefined> {
    let keyringUpdate: Uint8Array | undefined;
    if (eventType === goalEventTypes.goalCreated) {
      const update = await this.keyringManager.createInitialUpdate(
        aggregateId,
        encryptionKey,
        occurredAt
      );
      keyringUpdate = update?.keyringUpdate;
    }
    const currentEpoch = await this.keyringManager.getCurrentEpoch(aggregateId);
    const epoch = currentEpoch !== 0 ? currentEpoch : undefined;
    if (!keyringUpdate && epoch === undefined) {
      return undefined;
    }
    return { epoch, keyringUpdate };
  }
}
