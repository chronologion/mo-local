import { Injectable } from '@nestjs/common';
import { KeyEnvelopeRepository, type KeyEnvelopeInput } from '../application/ports/key-envelope-repository';
import { ScopeId } from '../domain/value-objects/ScopeId';
import { EnvelopeId } from '../domain/value-objects/EnvelopeId';
import { UserId } from '../domain/value-objects/UserId';
import { KeyEnvelope } from '../domain/entities/KeyEnvelope';
import { SharingDatabaseService } from './database.service';

@Injectable()
export class KyselyKeyEnvelopeRepository extends KeyEnvelopeRepository {
  constructor(private readonly dbService: SharingDatabaseService) {
    super();
  }

  async createEnvelope(envelope: KeyEnvelopeInput): Promise<void> {
    const db = this.dbService.getDb();

    await db
      .insertInto('sharing.key_envelopes')
      .values({
        envelope_id: envelope.envelopeId.unwrap(),
        scope_id: envelope.scopeId.unwrap(),
        recipient_user_id: envelope.recipientUserId.unwrap(),
        scope_epoch: envelope.scopeEpoch.toString(),
        recipient_uk_pub_fingerprint: envelope.recipientUkPubFingerprint,
        ciphersuite: envelope.ciphersuite,
        ciphertext: envelope.ciphertext,
        metadata: envelope.metadata ? JSON.stringify(envelope.metadata) : null,
      })
      .execute();
  }

  async getEnvelopes(scopeId: ScopeId, recipientUserId: UserId, scopeEpoch?: bigint): Promise<KeyEnvelope[]> {
    const db = this.dbService.getDb();

    let query = db
      .selectFrom('sharing.key_envelopes')
      .selectAll()
      .where('scope_id', '=', scopeId.unwrap())
      .where('recipient_user_id', '=', recipientUserId.unwrap());

    if (scopeEpoch !== undefined) {
      query = query.where('scope_epoch', '=', scopeEpoch.toString());
    }

    const rows = await query.orderBy('scope_epoch', 'asc').execute();

    return rows.map((row) => this.mapRowToEntity(row));
  }

  private mapRowToEntity(row: {
    envelope_id: string;
    scope_id: string;
    recipient_user_id: string;
    scope_epoch: string;
    recipient_uk_pub_fingerprint: Buffer;
    ciphersuite: string;
    ciphertext: Buffer;
    metadata: unknown;
    created_at: Date | string;
  }): KeyEnvelope {
    return {
      envelopeId: EnvelopeId.from(row.envelope_id),
      scopeId: ScopeId.from(row.scope_id),
      recipientUserId: UserId.from(row.recipient_user_id),
      scopeEpoch: BigInt(row.scope_epoch),
      recipientUkPubFingerprint: Buffer.from(row.recipient_uk_pub_fingerprint),
      ciphersuite: row.ciphersuite,
      ciphertext: Buffer.from(row.ciphertext),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    };
  }
}
