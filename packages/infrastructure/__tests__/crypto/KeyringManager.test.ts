import { describe, expect, it } from 'vitest';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import type { EncryptedEvent } from '@mo/application';

const createManager = async () => {
  const crypto = new NodeCryptoService();
  const keyStore = new InMemoryKeyStore();
  const keyringStore = new InMemoryKeyringStore();
  const masterKey = await crypto.generateKey();
  keyStore.setMasterKey(masterKey);
  const manager = new KeyringManager(crypto, keyStore, keyringStore);
  return { crypto, keyStore, keyringStore, manager, masterKey };
};

describe('KeyringManager', () => {
  // TODO(ALC-368): Removed tests for epoch/keyringUpdate in events - this functionality was replaced
  // by the sharing system. Events no longer carry epoch or keyringUpdate fields.
  // The following tests were removed:
  // - "creates and resolves keyring updates across devices" - tested keyringUpdate in events
  // - "resolves multiple epochs from a single keyring update" - tested epoch field in events
  // - "rejects keyring updates with mismatched aggregate id" - tested keyringUpdate validation
  // - "throws when requested epoch is missing from keyring" - tested epoch-based resolution
  // - "falls back to legacy aggregate key only for epoch 0" - tested epoch fallback
  // When sharing system is implemented, add new tests for sharing-based key resolution.

  it('createInitialUpdate is idempotent when keyring exists', async () => {
    const { manager, crypto } = await createManager();
    const aggregateId = 'goal-1';
    const dek = await crypto.generateKey();
    const createdAt = Date.now();

    const first = await manager.createInitialUpdate(aggregateId, dek, createdAt);
    const second = await manager.createInitialUpdate(aggregateId, dek, createdAt);

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  it('resolves key for event using epoch 0', async () => {
    const { manager, crypto, keyStore } = await createManager();
    const aggregateId = 'goal-test';
    const dek = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, dek);

    const event: EncryptedEvent = {
      id: 'event-test',
      aggregateType: 'goal',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: Date.now(),
      sequence: 1,
    };

    const resolved = await manager.resolveKeyForEvent(event);
    expect(resolved).toEqual(dek);
  });
});
