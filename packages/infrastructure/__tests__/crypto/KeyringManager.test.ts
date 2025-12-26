import { describe, expect, it } from 'vitest';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import type { EncryptedEvent } from '@mo/application';

describe('KeyringManager', () => {
  it('creates and resolves keyring updates across devices', async () => {
    const crypto = new NodeCryptoService();
    const ownerKeyStore = new InMemoryKeyStore();
    const ownerKeyringStore = new InMemoryKeyringStore();
    const masterKey = await crypto.generateKey();
    ownerKeyStore.setMasterKey(masterKey);

    const ownerManager = new KeyringManager(
      crypto,
      ownerKeyStore,
      ownerKeyringStore
    );

    const aggregateId = 'goal-abc';
    const dek = await crypto.generateKey();
    const createdAt = Date.now();
    const update = await ownerManager.createInitialUpdate(
      aggregateId,
      dek,
      createdAt
    );

    expect(update).toBeTruthy();
    if (!update) {
      throw new Error('Expected keyring update to be created');
    }

    const recipientKeyStore = new InMemoryKeyStore();
    const recipientKeyringStore = new InMemoryKeyringStore();
    recipientKeyStore.setMasterKey(masterKey);

    const recipientManager = new KeyringManager(
      crypto,
      recipientKeyStore,
      recipientKeyringStore
    );

    const event: EncryptedEvent = {
      id: 'event-1',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      keyringUpdate: update.keyringUpdate,
    };

    const resolved = await recipientManager.resolveKeyForEvent(event);
    expect(resolved).toEqual(dek);

    const stored = await recipientKeyStore.getAggregateKey(aggregateId);
    expect(stored).toEqual(dek);
  });
});
