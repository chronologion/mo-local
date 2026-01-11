import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  ResourceGrantRepository,
  ResourceGrantHeadMismatchError,
  type ResourceGrantInput,
} from '../application/ports/resource-grant-repository';
import { GrantId } from '../domain/value-objects/GrantId';
import { ScopeId } from '../domain/value-objects/ScopeId';
import { ResourceId } from '../domain/value-objects/ResourceId';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { ResourceGrant } from '../domain/entities/ResourceGrant';
import { SharingDatabaseService } from './database.service';

@Injectable()
export class KyselyResourceGrantRepository extends ResourceGrantRepository {
  constructor(private readonly dbService: SharingDatabaseService) {
    super();
  }

  async getHeadSeq(scopeId: ScopeId): Promise<SequenceNumber> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.resource_grants')
      .select(sql<string>`MAX(grant_seq)`.as('max_seq'))
      .where('scope_id', '=', scopeId.unwrap())
      .executeTakeFirst();

    return row?.max_seq ? SequenceNumber.from(row.max_seq) : SequenceNumber.zero();
  }

  async appendGrant(params: {
    scopeId: ScopeId;
    expectedHead: SequenceNumber;
    grant: ResourceGrantInput;
  }): Promise<{ seq: SequenceNumber; hash: Buffer }> {
    const db = this.dbService.getDb();
    const { scopeId, expectedHead, grant } = params;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock approach: We'll get current max seq for the scope
      // Note: Since grants don't have a single head table, we use the max seq from the grants table itself
      const currentMaxRow = await trx
        .selectFrom('sharing.resource_grants')
        .select(sql<string>`MAX(grant_seq)`.as('max_seq'))
        .where('scope_id', '=', scopeId.unwrap())
        .forUpdate()
        .executeTakeFirst();

      const currentHead = currentMaxRow?.max_seq ? SequenceNumber.from(currentMaxRow.max_seq) : SequenceNumber.zero();

      // 2. Check optimistic concurrency
      if (!currentHead.equals(expectedHead)) {
        throw new ResourceGrantHeadMismatchError(currentHead, expectedHead);
      }

      // 3. Validate hash chain
      if (expectedHead.unwrap() > 0n) {
        if (!grant.prevHash) {
          throw new Error('prevHash required for non-genesis append');
        }
        // Get the previous grant's hash to validate chain
        const prevGrant = await trx
          .selectFrom('sharing.resource_grants')
          .select('grant_hash')
          .where('scope_id', '=', scopeId.unwrap())
          .where('grant_seq', '=', expectedHead.toString())
          .executeTakeFirst();

        if (!prevGrant) {
          throw new Error(`Previous grant at seq ${expectedHead.toString()} not found`);
        }
        if (!Buffer.from(prevGrant.grant_hash).equals(grant.prevHash)) {
          throw new Error('prevHash does not match previous grant_hash (hash-chain violation)');
        }
      } else {
        // Genesis record must have null prevHash
        if (grant.prevHash !== null) {
          throw new Error('prevHash must be null for genesis append');
        }
      }

      const nextSeq = currentHead.increment();

      // 4. Insert new grant
      const inserted = await trx
        .insertInto('sharing.resource_grants')
        .values({
          grant_id: grant.grantId.unwrap(),
          scope_id: scopeId.unwrap(),
          resource_id: grant.resourceId.unwrap(),
          grant_seq: nextSeq.toString(),
          prev_hash: grant.prevHash,
          grant_hash: grant.grantHash,
          scope_state_ref: grant.scopeStateRef,
          scope_epoch: grant.scopeEpoch.toString(),
          resource_key_id: grant.resourceKeyId,
          wrapped_key: grant.wrappedKey,
          policy: grant.policy ? JSON.stringify(grant.policy) : null,
          status: grant.status,
          signed_grant_cbor: grant.signedGrantCbor,
          sig_suite: grant.sigSuite,
          signature: grant.signature,
        })
        .returning(['grant_seq', 'grant_hash'])
        .executeTakeFirstOrThrow();

      // 5. Update resource_grant_heads (tracks active grant per resource)
      if (grant.status === 'active') {
        await trx
          .insertInto('sharing.resource_grant_heads')
          .values({
            scope_id: scopeId.unwrap(),
            resource_id: grant.resourceId.unwrap(),
            active_grant_id: grant.grantId.unwrap(),
            head_seq: nextSeq.toString(),
            head_hash: grant.grantHash,
          })
          .onConflict((oc) =>
            oc.columns(['scope_id', 'resource_id']).doUpdateSet({
              active_grant_id: grant.grantId.unwrap(),
              head_seq: nextSeq.toString(),
              head_hash: grant.grantHash,
              updated_at: sql`NOW()`,
            })
          )
          .execute();
      }

      return {
        seq: SequenceNumber.from(inserted.grant_seq),
        hash: Buffer.from(inserted.grant_hash),
      };
    });
  }

  async loadSince(scopeId: ScopeId, since: SequenceNumber, limit: number): Promise<ResourceGrant[]> {
    const db = this.dbService.getDb();
    const rows = await db
      .selectFrom('sharing.resource_grants')
      .selectAll()
      .where('scope_id', '=', scopeId.unwrap())
      .where('grant_seq', '>', since.toString())
      .orderBy('grant_seq', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  async getActiveGrant(scopeId: ScopeId, resourceId: ResourceId): Promise<ResourceGrant | null> {
    const db = this.dbService.getDb();

    // First get the active grant ID from the heads table
    const headRow = await db
      .selectFrom('sharing.resource_grant_heads')
      .select('active_grant_id')
      .where('scope_id', '=', scopeId.unwrap())
      .where('resource_id', '=', resourceId.unwrap())
      .executeTakeFirst();

    if (!headRow) {
      return null;
    }

    // Then fetch the full grant record
    const row = await db
      .selectFrom('sharing.resource_grants')
      .selectAll()
      .where('grant_id', '=', headRow.active_grant_id)
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  async loadByGrantId(grantId: GrantId): Promise<ResourceGrant | null> {
    const db = this.dbService.getDb();
    const row = await db
      .selectFrom('sharing.resource_grants')
      .selectAll()
      .where('grant_id', '=', grantId.unwrap())
      .executeTakeFirst();

    return row ? this.mapRowToEntity(row) : null;
  }

  private mapRowToEntity(row: {
    grant_id: string;
    scope_id: string;
    resource_id: string;
    grant_seq: string;
    prev_hash: Buffer | null;
    grant_hash: Buffer;
    scope_state_ref: Buffer;
    scope_epoch: string;
    resource_key_id: string;
    wrapped_key: Buffer;
    policy: unknown;
    status: string;
    signed_grant_cbor: Buffer;
    sig_suite: string;
    signature: Buffer;
    created_at: Date | string;
  }): ResourceGrant {
    return {
      grantId: GrantId.from(row.grant_id),
      scopeId: ScopeId.from(row.scope_id),
      resourceId: ResourceId.from(row.resource_id),
      grantSeq: SequenceNumber.from(row.grant_seq),
      prevHash: row.prev_hash ? Buffer.from(row.prev_hash) : null,
      grantHash: Buffer.from(row.grant_hash),
      scopeStateRef: Buffer.from(row.scope_state_ref),
      scopeEpoch: BigInt(row.scope_epoch),
      resourceKeyId: row.resource_key_id,
      wrappedKey: Buffer.from(row.wrapped_key),
      policy: typeof row.policy === 'string' ? JSON.parse(row.policy) : row.policy,
      status: row.status as 'active' | 'revoked',
      signedGrantCbor: Buffer.from(row.signed_grant_cbor),
      sigSuite: row.sig_suite,
      signature: Buffer.from(row.signature),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    };
  }
}
