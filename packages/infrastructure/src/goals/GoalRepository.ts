import { Goal, GoalId, Timestamp, UserId, goalEventTypes } from '@mo/domain';
import type { GoalSnapshot } from '@mo/domain';
import {
  ConcurrencyError,
  IEventStore,
  IGoalRepository,
  IKeyStore,
  none,
  Option,
  some,
} from '@mo/application';
import type { Store } from '@livestore/livestore';
import { DomainToLiveStoreAdapter } from '../livestore/adapters/DomainToLiveStoreAdapter';
import { LiveStoreToDomainAdapter } from '../livestore/adapters/LiveStoreToDomainAdapter';
import { WebCryptoService } from '../crypto/WebCryptoService';
import { KeyringManager } from '../crypto/KeyringManager';
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
    private readonly keyStore: IKeyStore,
    private readonly keyringManager: KeyringManager
  ) {
    this.toEncrypted = new DomainToLiveStoreAdapter(crypto);
    this.toDomain = new LiveStoreToDomainAdapter(crypto);
  }

  async load(id: GoalId): Promise<Option<Goal>> {
    const snapshotKey = await this.keyStore.getAggregateKey(id.value);
    const loadedSnapshot = snapshotKey
      ? await this.loadSnapshot(id.value, snapshotKey)
      : null;
    const tailEvents = loadedSnapshot
      ? await this.eventStore.getAllEvents({
          aggregateId: id.value,
          since: loadedSnapshot.lastSequence,
        })
      : await this.eventStore.getAllEvents({ aggregateId: id.value });
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
    const eventVersionRows = this.store.query<{ version: number | null }[]>({
      query:
        'SELECT MAX(version) as version FROM goal_events WHERE aggregate_id = ?',
      bindValues: [goal.id.value],
    });
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
  ): Promise<{ snapshot: GoalSnapshot; lastSequence: number } | null> {
    const rows = this.store.query<
      {
        payload_encrypted: Uint8Array;
        version: number;
        last_sequence: number;
      }[]
    >({
      query:
        'SELECT payload_encrypted, version, last_sequence FROM goal_snapshots WHERE aggregate_id = ? LIMIT 1',
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
    return {
      snapshot: decodeGoalSnapshotDomain(plaintext, row.version),
      lastSequence: Number(row.last_sequence),
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
