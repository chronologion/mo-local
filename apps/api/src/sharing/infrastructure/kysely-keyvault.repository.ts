import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  KeyVaultRepository,
  KeyVaultHeadMismatchError,
  type KeyVaultRecordInput,
} from '../application/ports/keyvault-repository';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { KeyVaultRecord } from '../domain/entities/KeyVaultRecord';
import { SharingDatabaseService } from './database.service';

@Injectable()
export class KyselyKeyVaultRepository extends KeyVaultRepository {
  constructor(private readonly dbService: SharingDatabaseService) {
    super();
  }

  async getHeadSeq(userId: string): Promise<SequenceNumber> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.keyvault_heads')
      .select('head_seq')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row ? SequenceNumber.from(row.head_seq) : SequenceNumber.zero();
  }

  async getHeadHash(userId: string): Promise<Buffer | null> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.keyvault_heads')
      .select('head_hash')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return row?.head_hash ? Buffer.from(row.head_hash) : null;
  }

  async appendRecord(params: {
    userId: string;
    expectedHead: SequenceNumber;
    record: KeyVaultRecordInput;
  }): Promise<{ seq: SequenceNumber; hash: Buffer }> {
    const db = this.dbService.getDb();
    const { userId, expectedHead, record } = params;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock head row
      const headRow = await trx
        .selectFrom('sharing.keyvault_heads')
        .select(['head_seq', 'head_hash'])
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();

      const currentHead = headRow ? SequenceNumber.from(headRow.head_seq) : SequenceNumber.zero();

      // 2. Check optimistic concurrency
      if (!currentHead.equals(expectedHead)) {
        throw new KeyVaultHeadMismatchError(currentHead, expectedHead);
      }

      // 3. Validate hash chain
      if (expectedHead.unwrap() > 0n) {
        if (!record.prevHash) {
          throw new Error('prevHash required for non-genesis append');
        }
        if (!headRow?.head_hash) {
          throw new Error('head_hash missing for non-genesis KeyVault');
        }
        if (!Buffer.from(headRow.head_hash).equals(record.prevHash)) {
          throw new Error('prevHash does not match current head_hash (hash-chain violation)');
        }
      } else {
        // Genesis record must have null prevHash
        if (record.prevHash !== null) {
          throw new Error('prevHash must be null for genesis append');
        }
      }

      const nextSeq = currentHead.increment();

      // 4. Insert new record
      const inserted = await trx
        .insertInto('sharing.keyvault_records')
        .values({
          user_id: userId,
          record_seq: nextSeq.toString(),
          prev_hash: record.prevHash,
          record_hash: record.recordHash,
          ciphertext: record.ciphertext,
          metadata: record.metadata ? JSON.stringify(record.metadata) : null,
        })
        .returning(['record_seq', 'record_hash'])
        .executeTakeFirstOrThrow();

      // 5. Update head (upsert)
      await trx
        .insertInto('sharing.keyvault_heads')
        .values({
          user_id: userId,
          head_seq: nextSeq.toString(),
          head_hash: record.recordHash,
        })
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({
            head_seq: nextSeq.toString(),
            head_hash: record.recordHash,
            updated_at: sql`NOW()`,
          })
        )
        .execute();

      return {
        seq: SequenceNumber.from(inserted.record_seq),
        hash: Buffer.from(inserted.record_hash),
      };
    });
  }

  async loadSince(userId: string, since: SequenceNumber, limit: number): Promise<KeyVaultRecord[]> {
    const db = this.dbService.getDb();
    const rows = await db
      .selectFrom('sharing.keyvault_records')
      .selectAll()
      .where('user_id', '=', userId)
      .where('record_seq', '>', since.toString())
      .orderBy('record_seq', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  private mapRowToEntity(row: {
    user_id: string;
    record_seq: string;
    prev_hash: Buffer | null;
    record_hash: Buffer;
    ciphertext: Buffer;
    metadata: unknown;
    created_at: Date | string;
  }): KeyVaultRecord {
    return {
      userId: row.user_id,
      recordSeq: SequenceNumber.from(row.record_seq),
      prevHash: row.prev_hash ? Buffer.from(row.prev_hash) : null,
      recordHash: Buffer.from(row.record_hash),
      ciphertext: Buffer.from(row.ciphertext),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    };
  }
}
