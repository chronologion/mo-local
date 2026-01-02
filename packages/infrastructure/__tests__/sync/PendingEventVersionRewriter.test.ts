import { describe, expect, it } from 'vitest';
import type { ChangeHint, SqliteBatchResult, SqliteDbPort, SqliteStatement, SqliteValue } from '@mo/eventstore-web';
import { SqliteStatementKinds } from '@mo/eventstore-web';
import { buildEventAad } from '../../src/eventing/aad';
import { PendingEventVersionRewriter } from '../../src/sync/PendingEventVersionRewriter';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';

type EventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  epoch: number | null;
}>;

type SnapshotRow = Readonly<{
  aggregate_type: string;
  aggregate_id: string;
}>;

type SyncEventMapRow = Readonly<{
  event_id: string;
  global_seq: number;
  inserted_at: number;
}>;

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toUpperCase();

class FakeDb implements SqliteDbPort {
  events: EventRow[] = [];
  snapshots: SnapshotRow[] = [];
  syncEventMap: SyncEventMapRow[] = [];

  async query<T extends Readonly<Record<string, unknown>>>(
    sql: string,
    params: ReadonlyArray<SqliteValue> = []
  ): Promise<ReadonlyArray<T>> {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith('SELECT E.ID')) {
      const [aggregateType, aggregateId, fromVersion] = params as [string, string, number];
      const rows = this.events
        .filter(
          (row) =>
            row.aggregate_type === aggregateType &&
            row.aggregate_id === aggregateId &&
            row.version >= fromVersion &&
            !this.syncEventMap.some((m) => m.event_id === row.id)
        )
        .sort((a, b) => b.version - a.version);
      return rows as unknown as T[];
    }
    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(sql: string, params: ReadonlyArray<SqliteValue> = []): Promise<void> {
    const normalized = normalizeSql(sql);
    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return;
    }

    if (normalized.startsWith('UPDATE EVENTS SET VERSION = ?')) {
      const [nextVersion, payloadEncrypted, id] = params as [number, Uint8Array, string];
      this.events = this.events.map((row) =>
        row.id === id
          ? {
              ...row,
              version: Number(nextVersion),
              payload_encrypted: payloadEncrypted,
            }
          : row
      );
      return;
    }

    if (normalized.startsWith('DELETE FROM SNAPSHOTS WHERE')) {
      const [aggregateType, aggregateId] = params as [string, string];
      this.snapshots = this.snapshots.filter(
        (row) => !(row.aggregate_type === aggregateType && row.aggregate_id === aggregateId)
      );
      return;
    }

    throw new Error(`Unhandled execute: ${sql}`);
  }

  async batch(statements: ReadonlyArray<SqliteStatement>): Promise<ReadonlyArray<SqliteBatchResult>> {
    const results: SqliteBatchResult[] = [];
    for (const statement of statements) {
      if (statement.kind === SqliteStatementKinds.execute) {
        await this.execute(statement.sql, statement.params ?? []);
        results.push({ kind: SqliteStatementKinds.execute });
        continue;
      }
      const rows = await this.query(statement.sql, statement.params ?? []);
      results.push({ kind: SqliteStatementKinds.query, rows });
    }
    return results;
  }

  subscribeToTables(_tables: ReadonlyArray<string>, _listener: () => void): () => void {
    return () => undefined;
  }

  subscribeToChanges?(
    _tables: ReadonlyArray<string>,
    _listener: (hints: ReadonlyArray<ChangeHint>) => void
  ): () => void {
    return () => undefined;
  }
}

describe('PendingEventVersionRewriter', () => {
  it('shifts pending versions and re-encrypts payload using version-bound AAD', async () => {
    const crypto = new NodeCryptoService();
    const keyStore = new InMemoryKeyStore();
    keyStore.setMasterKey(new Uint8Array(32).fill(7));
    const keyringStore = new InMemoryKeyringStore();
    const keyringManager = new KeyringManager(crypto, keyStore, keyringStore);
    const db = new FakeDb();

    const aggregateType = 'goal';
    const aggregateId = 'goal-1';
    const eventType = 'GoalCreated';
    const key = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, key);

    const plaintext = new TextEncoder().encode('hello');
    const cipherV1 = await crypto.encrypt(plaintext, key, buildEventAad(aggregateId, eventType, 1));

    db.events.push({
      id: 'local-1',
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      event_type: eventType,
      payload_encrypted: cipherV1,
      keyring_update: null,
      version: 1,
      occurred_at: Date.now(),
      actor_id: null,
      causation_id: null,
      correlation_id: null,
      epoch: null,
    });
    db.snapshots.push({
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
    });

    const rewriter = new PendingEventVersionRewriter(db, crypto, keyringManager);
    const result = await rewriter.rewritePendingVersions({
      aggregateType,
      aggregateId,
      fromVersionInclusive: 1,
    });

    expect(result).toEqual({
      aggregateType,
      aggregateId,
      fromVersionInclusive: 1,
      shiftedCount: 1,
      oldMaxVersion: 1,
      newMaxVersion: 2,
    });
    expect(db.events[0]?.version).toBe(2);
    expect(db.snapshots).toEqual([]);

    const cipherV2 = db.events[0]?.payload_encrypted;
    expect(cipherV2).toBeInstanceOf(Uint8Array);
    if (!cipherV2) return;

    await expect(crypto.decrypt(cipherV2, key, buildEventAad(aggregateId, eventType, 1))).rejects.toBeInstanceOf(Error);

    await expect(crypto.decrypt(cipherV2, key, buildEventAad(aggregateId, eventType, 2))).resolves.toEqual(plaintext);
  });
});
