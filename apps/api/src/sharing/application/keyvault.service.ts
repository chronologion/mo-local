import { Injectable } from '@nestjs/common';
import { KeyVaultRepository, KeyVaultRecordInput } from './ports/keyvault-repository';
import { SequenceNumber } from '../domain/value-objects/SequenceNumber';
import { KeyVaultRecord } from '../domain/entities/KeyVaultRecord';

/**
 * Application service for KeyVault operations.
 * Orchestrates repository interactions for KeyVault records.
 */
@Injectable()
export class KeyVaultService {
  constructor(private readonly vaultRepo: KeyVaultRepository) {}

  /**
   * Append a new KeyVault record with optimistic concurrency.
   */
  async appendRecord(
    userId: string,
    expectedHead: SequenceNumber,
    record: KeyVaultRecordInput
  ): Promise<{ seq: SequenceNumber; hash: Buffer }> {
    return await this.vaultRepo.appendRecord({
      userId,
      expectedHead,
      record,
    });
  }

  /**
   * Get current head sequence for a user's KeyVault.
   */
  async getHeadSeq(userId: string): Promise<SequenceNumber> {
    return await this.vaultRepo.getHeadSeq(userId);
  }

  /**
   * Get current head hash for a user's KeyVault.
   */
  async getHeadHash(userId: string): Promise<Buffer | null> {
    return await this.vaultRepo.getHeadHash(userId);
  }

  /**
   * Get KeyVault update stream since a given sequence.
   */
  async getUpdateStream(
    userId: string,
    since: SequenceNumber,
    limit: number
  ): Promise<{
    records: KeyVaultRecord[];
    hasMore: boolean;
    head: SequenceNumber;
    nextSince: SequenceNumber | null;
  }> {
    const records = await this.vaultRepo.loadSince(userId, since, limit);
    const hasMore = records.length === limit;
    const nextSince = hasMore ? records[records.length - 1].recordSeq : null;
    const head = await this.getHeadSeq(userId);

    return { records, hasMore, head, nextSince };
  }
}
