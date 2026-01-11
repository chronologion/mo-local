import { describe, expect, it } from 'vitest';
import { KyselyScopeStateRepository } from '../../src/sharing/infrastructure/kysely-scope-state.repository';
import { ScopeStateHeadMismatchError } from '../../src/sharing/application/ports/scope-state-repository';
import { ScopeId } from '../../src/sharing/domain/value-objects/ScopeId';
import { SequenceNumber } from '../../src/sharing/domain/value-objects/SequenceNumber';
import { UserId } from '../../src/sharing/domain/value-objects/UserId';
import type { SharingDatabaseService } from '../../src/sharing/infrastructure/database.service';

type ScopeStateRow = {
  id: number;
  scope_id: string;
  scope_state_seq: string;
  prev_hash: Buffer | null;
  scope_state_ref: Buffer;
  owner_user_id: string;
  scope_epoch: string;
  signed_record_cbor: Buffer;
  members: unknown;
  signers: unknown;
  sig_suite: string;
  signature: Buffer;
  created_at: Date;
};

type ScopeStateHeadRow = {
  scope_id: string;
  owner_user_id: string;
  head_seq: string;
  head_ref: Buffer | null;
  created_at: Date;
  updated_at: Date;
};

type WhereClause = {
  column: string;
  op: '=' | '>';
  value: string | Buffer;
};

class FakeDb {
  scopeStates: ScopeStateRow[] = [];
  scopeStateHeads: ScopeStateHeadRow[] = [];
  nextId = 1;
}

class FakeSelectBuilder<T extends { [key: string]: unknown }> {
  constructor(
    private readonly rows: T[],
    private readonly clauses: WhereClause[] = []
  ) {}

  select(): FakeSelectBuilder<T> {
    return new FakeSelectBuilder(this.rows, this.clauses);
  }

  where(column: string, op: '=' | '>', value: WhereClause['value']): this {
    return new FakeSelectBuilder(this.rows, [...this.clauses, { column, op, value }]) as this;
  }

  forUpdate(): this {
    return this;
  }

  executeTakeFirst(): T | undefined {
    return this.applyClauses()[0];
  }

  execute(): T[] {
    return this.applyClauses();
  }

  private applyClauses(): T[] {
    return this.rows.filter((row) =>
      this.clauses.every((clause) => {
        const value = row[clause.column];
        if (clause.op === '=') {
          if (Buffer.isBuffer(clause.value) && Buffer.isBuffer(value)) {
            return clause.value.equals(value as Buffer);
          }
          return value === clause.value;
        }
        return false;
      })
    );
  }
}

type FakeTrx = {
  selectFrom: (table: string) => FakeSelectBuilder<ScopeStateHeadRow>;
  insertInto: (table: string) => {
    values: (row: Partial<ScopeStateRow> | Partial<ScopeStateHeadRow>) => {
      execute?: () => Promise<void>;
      returning?: (columns: string[]) => {
        executeTakeFirstOrThrow: () => Promise<{ scope_state_seq: string; scope_state_ref: Buffer }>;
      };
      onConflict?: (fn: (oc: { column: (c: string) => { doUpdateSet: (v: unknown) => void } }) => void) => {
        execute: () => Promise<void>;
      };
    };
  };
};

const makeDbService = (db: FakeDb): SharingDatabaseService =>
  ({
    getDb: () => ({
      transaction: () => ({
        execute: async (fn: (trx: FakeTrx) => Promise<unknown>) => {
          return fn({
            selectFrom: (table: string) => {
              if (table === 'sharing.scope_state_heads') {
                return new FakeSelectBuilder(db.scopeStateHeads);
              }
              throw new Error(`Unexpected table: ${table}`);
            },
            insertInto: (table: string) => ({
              values: (row: Partial<ScopeStateRow> | Partial<ScopeStateHeadRow>) => {
                if (table === 'sharing.scope_states') {
                  const stateRow = row as Partial<ScopeStateRow>;

                  // Validate hash chain
                  const currentHead = db.scopeStateHeads.find((h) => h.scope_id === stateRow.scope_id);
                  if (currentHead && currentHead.head_seq !== '0' && currentHead.head_ref) {
                    if (!stateRow.prev_hash || !Buffer.from(currentHead.head_ref).equals(stateRow.prev_hash)) {
                      throw new Error('prevHash does not match current head_ref (hash-chain violation)');
                    }
                  }

                  const newRow = {
                    id: db.nextId++,
                    scope_id: stateRow.scope_id!,
                    scope_state_seq: stateRow.scope_state_seq!,
                    prev_hash: stateRow.prev_hash!,
                    scope_state_ref: stateRow.scope_state_ref!,
                    owner_user_id: stateRow.owner_user_id!,
                    scope_epoch: stateRow.scope_epoch!,
                    signed_record_cbor: stateRow.signed_record_cbor!,
                    members: stateRow.members!,
                    signers: stateRow.signers!,
                    sig_suite: stateRow.sig_suite!,
                    signature: stateRow.signature!,
                    created_at: new Date(),
                  };
                  db.scopeStates.push(newRow);
                  return {
                    returning: () => ({
                      executeTakeFirstOrThrow: async () => ({
                        scope_state_seq: newRow.scope_state_seq,
                        scope_state_ref: newRow.scope_state_ref,
                      }),
                    }),
                  };
                }
                if (table === 'sharing.scope_state_heads') {
                  const headRow = row as Partial<ScopeStateHeadRow>;
                  return {
                    onConflict: () => ({
                      execute: async () => {
                        const existing = db.scopeStateHeads.find((h) => h.scope_id === headRow.scope_id);
                        if (existing) {
                          existing.head_seq = headRow.head_seq!;
                          existing.head_ref = headRow.head_ref!;
                          existing.updated_at = new Date();
                        } else {
                          db.scopeStateHeads.push({
                            scope_id: headRow.scope_id!,
                            owner_user_id: headRow.owner_user_id!,
                            head_seq: headRow.head_seq!,
                            head_ref: headRow.head_ref!,
                            created_at: new Date(),
                            updated_at: new Date(),
                          });
                        }
                      },
                    }),
                  };
                }
                throw new Error(`Unexpected table: ${table}`);
              },
            }),
          });
        },
      }),
      selectFrom: (table: string) => {
        if (table === 'sharing.scope_state_heads') {
          return new FakeSelectBuilder(db.scopeStateHeads);
        }
        if (table === 'sharing.scope_states') {
          return new FakeSelectBuilder(db.scopeStates);
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    }),
  }) as unknown as SharingDatabaseService;

describe('KyselyScopeStateRepository', () => {
  it('appends genesis state (seq 1) when head is 0', async () => {
    const db = new FakeDb();
    const repo = new KyselyScopeStateRepository(makeDbService(db));
    const scopeId = ScopeId.from('scope-1');
    const ref = Buffer.from('aabbccddee', 'hex');

    const result = await repo.appendState({
      scopeId,
      expectedHead: SequenceNumber.zero(),
      state: {
        prevHash: null,
        scopeStateRef: ref,
        ownerUserId: UserId.from('user-1'),
        scopeEpoch: 1n,
        signedRecordCbor: Buffer.from('cbor'),
        members: {},
        signers: {},
        sigSuite: 'ed25519',
        signature: Buffer.from('sig'),
      },
    });

    expect(result.seq.unwrap()).toBe(1n);
    expect(result.ref).toEqual(ref);
    expect(db.scopeStates).toHaveLength(1);
    expect(db.scopeStates[0]?.scope_state_seq).toBe('1');
    expect(db.scopeStateHeads[0]?.head_seq).toBe('1');
  });

  it('validates hash chain on append', async () => {
    const db = new FakeDb();
    const firstRef = Buffer.from('aabbcc', 'hex');
    db.scopeStateHeads.push({
      scope_id: 'scope-1',
      owner_user_id: 'user-1',
      head_seq: '1',
      head_ref: firstRef,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const repo = new KyselyScopeStateRepository(makeDbService(db));
    const scopeId = ScopeId.from('scope-1');
    const wrongPrevHash = Buffer.from('ddeeff', 'hex');

    await expect(
      repo.appendState({
        scopeId,
        expectedHead: SequenceNumber.from(1),
        state: {
          prevHash: wrongPrevHash,
          scopeStateRef: Buffer.from('112233', 'hex'),
          ownerUserId: UserId.from('user-1'),
          scopeEpoch: 1n,
          signedRecordCbor: Buffer.from('cbor'),
          members: {},
          signers: {},
          sigSuite: 'ed25519',
          signature: Buffer.from('sig'),
        },
      })
    ).rejects.toThrow('prevHash does not match current head_ref');
  });

  it('throws on head mismatch', async () => {
    const db = new FakeDb();
    db.scopeStateHeads.push({
      scope_id: 'scope-1',
      owner_user_id: 'user-1',
      head_seq: '2',
      head_ref: Buffer.from('445566', 'hex'),
      created_at: new Date(),
      updated_at: new Date(),
    });

    const repo = new KyselyScopeStateRepository(makeDbService(db));
    const scopeId = ScopeId.from('scope-1');

    await expect(
      repo.appendState({
        scopeId,
        expectedHead: SequenceNumber.from(1),
        state: {
          prevHash: null,
          scopeStateRef: Buffer.from('778899', 'hex'),
          ownerUserId: UserId.from('user-1'),
          scopeEpoch: 1n,
          signedRecordCbor: Buffer.from('cbor'),
          members: {},
          signers: {},
          sigSuite: 'ed25519',
          signature: Buffer.from('sig'),
        },
      })
    ).rejects.toBeInstanceOf(ScopeStateHeadMismatchError);
  });
});
