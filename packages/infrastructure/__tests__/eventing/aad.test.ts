import { describe, expect, it } from 'vitest';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { buildEventAad, buildSnapshotAad } from '../../src/eventing/aad';

describe('AAD binding', () => {
  it('binds event ciphertext integrity to {aggregateId,eventType,version}', async () => {
    const crypto = new NodeCryptoService();
    const key = await crypto.generateKey();
    const plaintext = new TextEncoder().encode('secret-data');

    const aad = buildEventAad('agg-1', 'GoalCreated', 1);
    const ciphertext = await crypto.encrypt(plaintext, key, aad);

    await expect(crypto.decrypt(ciphertext, key, buildEventAad('agg-2', 'GoalCreated', 1))).rejects.toBeInstanceOf(
      Error
    );
    await expect(crypto.decrypt(ciphertext, key, buildEventAad('agg-1', 'GoalRefined', 1))).rejects.toBeInstanceOf(
      Error
    );
    await expect(crypto.decrypt(ciphertext, key, buildEventAad('agg-1', 'GoalCreated', 2))).rejects.toBeInstanceOf(
      Error
    );

    await expect(crypto.decrypt(ciphertext, key, aad)).resolves.toEqual(plaintext);
  });

  it('binds snapshot ciphertext integrity to {aggregateId,snapshot,version}', async () => {
    const crypto = new NodeCryptoService();
    const key = await crypto.generateKey();
    const plaintext = new TextEncoder().encode('snapshot-bytes');

    const aad = buildSnapshotAad('agg-1', 1);
    const ciphertext = await crypto.encrypt(plaintext, key, aad);

    await expect(crypto.decrypt(ciphertext, key, buildSnapshotAad('agg-2', 1))).rejects.toBeInstanceOf(Error);
    await expect(crypto.decrypt(ciphertext, key, buildSnapshotAad('agg-1', 2))).rejects.toBeInstanceOf(Error);

    await expect(crypto.decrypt(ciphertext, key, aad)).resolves.toEqual(plaintext);
  });
});
