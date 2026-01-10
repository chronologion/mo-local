import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  ScopeStateRepository,
  ScopeStateHeadMismatchError,
  type ScopeStateInput,
} from '../application/ports/scope-state-repository';
import { ScopeId } from '../domain/value-objects/ScopeId';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { ScopeState } from '../domain/entities/ScopeState';
import { SharingDatabaseService } from './database.service';

@Injectable()
export class KyselyScopeStateRepository extends ScopeStateRepository {
  constructor(private readonly dbService: SharingDatabaseService) {
    super();
  }

  async getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.scope_state_heads')
      .select('head_seq')
      .where('scope_id', '=', scopeId.unwrap())
      .executeTakeFirst();

    return row ? SequenceNumber.from(row.head_seq) : SequenceNumber.zero();
  }

  async getHeadRef(scopeId: ScopeId): Promise<Buffer | null> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.scope_state_heads')
      .select('head_ref')
      .where('scope_id', '=', scopeId.unwrap())
      .executeTakeFirst();

    return row?.head_ref ? Buffer.from(row.head_ref) : null;
  }

  async appendState(params: {
    scopeId: ScopeId;
    expectedHead: SequenceNumber;
    state: ScopeStateInput;
  }): Promise<{ seq: SequenceNumber; ref: Buffer }> {
    const db = this.dbService.getDb();
    const { scopeId, expectedHead, state } = params;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock head row (pessimistic lock for optimistic concurrency)
      const headRow = await trx
        .selectFrom('sharing.scope_state_heads')
        .select(['head_seq', 'head_ref'])
        .where('scope_id', '=', scopeId.unwrap())
        .forUpdate()
        .executeTakeFirst();

      const currentHead = headRow ? SequenceNumber.from(headRow.head_seq) : SequenceNumber.zero();

      // 2. Check optimistic concurrency
      if (!currentHead.equals(expectedHead)) {
        throw new ScopeStateHeadMismatchError(currentHead, expectedHead);
      }

      // 3. Validate hash chain
      if (expectedHead.unwrap() > 0n) {
        if (!state.prevHash) {
          throw new Error('prevHash required for non-genesis append');
        }
        if (!headRow?.head_ref) {
          throw new Error('head_ref missing for non-genesis scope');
        }
        if (!Buffer.from(headRow.head_ref).equals(state.prevHash)) {
          throw new Error('prevHash does not match current head_ref (hash-chain violation)');
        }
      } else {
        // Genesis record must have null prevHash
        if (state.prevHash !== null) {
          throw new Error('prevHash must be null for genesis append');
        }
      }

      const nextSeq = currentHead.increment();

      // 4. Insert new state
      const inserted = await trx
        .insertInto('sharing.scope_states')
        .values({
          scope_id: scopeId.unwrap(),
          scope_state_seq: nextSeq.toString(),
          prev_hash: state.prevHash,
          scope_state_ref: state.scopeStateRef,
          owner_user_id: state.ownerUserId,
          scope_epoch: state.scopeEpoch.toString(),
          signed_record_cbor: state.signedRecordCbor,
          members: JSON.stringify(state.members),
          signers: JSON.stringify(state.signers),
          sig_suite: state.sigSuite,
          signature: state.signature,
        })
        .returning(['scope_state_seq', 'scope_state_ref'])
        .executeTakeFirstOrThrow();

      // 5. Update head (upsert)
      await trx
        .insertInto('sharing.scope_state_heads')
        .values({
          scope_id: scopeId.unwrap(),
          owner_user_id: state.ownerUserId,
          head_seq: nextSeq.toString(),
          head_ref: state.scopeStateRef,
        })
        .onConflict((oc) =>
          oc.column('scope_id').doUpdateSet({
            head_seq: nextSeq.toString(),
            head_ref: state.scopeStateRef,
            updated_at: sql`NOW()`,
          })
        )
        .execute();

      return {
        seq: SequenceNumber.from(inserted.scope_state_seq),
        ref: Buffer.from(inserted.scope_state_ref),
      };
    });
  }

  async loadSince(scopeId: ScopeId, since: SequenceNumber, limit: number): Promise<ScopeState[]> {
    const db = this.dbService.getDb();
    const rows = await db
      .selectFrom('sharing.scope_states')
      .selectAll()
      .where('scope_id', '=', scopeId.unwrap())
      .where('scope_state_seq', '>', since.toString())
      .orderBy('scope_state_seq', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  async loadByRef(scopeStateRef: Buffer): Promise<ScopeState | null> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.scope_states')
      .selectAll()
      .where('scope_state_ref', '=', scopeStateRef)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  private mapRowToEntity(row: {
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
    created_at: Date | string;
  }): ScopeState {
    return {
      scopeId: ScopeId.from(row.scope_id),
      scopeStateSeq: SequenceNumber.from(row.scope_state_seq),
      prevHash: row.prev_hash ? Buffer.from(row.prev_hash) : null,
      scopeStateRef: Buffer.from(row.scope_state_ref),
      ownerUserId: row.owner_user_id,
      scopeEpoch: BigInt(row.scope_epoch),
      signedRecordCbor: Buffer.from(row.signed_record_cbor),
      members: typeof row.members === 'string' ? JSON.parse(row.members) : row.members,
      signers: typeof row.signers === 'string' ? JSON.parse(row.signers) : row.signers,
      sigSuite: row.sig_suite,
      signature: Buffer.from(row.signature),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    };
  }
}
