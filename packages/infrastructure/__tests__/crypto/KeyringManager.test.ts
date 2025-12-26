import { describe, expect, it } from 'vitest';
import { KeyringManager } from '../../src/crypto/KeyringManager';
import { InMemoryKeyringStore } from '../../src/crypto/InMemoryKeyringStore';
import { InMemoryKeyStore } from '../fixtures/InMemoryKeyStore';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import type { EncryptedEvent } from '@mo/application';
import { Keyring } from '../../src/crypto/Keyring';
import { MissingKeyError } from '../../src/errors';

const createManager = async () => {
  const crypto = new NodeCryptoService();
  const keyStore = new InMemoryKeyStore();
  const keyringStore = new InMemoryKeyringStore();
  const masterKey = await crypto.generateKey();
  keyStore.setMasterKey(masterKey);
  const manager = new KeyringManager(crypto, keyStore, keyringStore);
  return { crypto, keyStore, keyringStore, manager, masterKey };
};

const encryptKeyringUpdate = async (
  crypto: NodeCryptoService,
  masterKey: Uint8Array,
  aggregateId: string,
  keyring: Keyring
): Promise<Uint8Array> => {
  const ownerKey = await crypto.deriveKey(masterKey, `keyring:${aggregateId}`);
  return crypto.encrypt(keyring.toBytes(), ownerKey);
};

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

  it('createInitialUpdate is idempotent when keyring exists', async () => {
    const { manager, crypto } = await createManager();
    const aggregateId = 'goal-1';
    const dek = await crypto.generateKey();
    const createdAt = Date.now();

    const first = await manager.createInitialUpdate(
      aggregateId,
      dek,
      createdAt
    );
    const second = await manager.createInitialUpdate(
      aggregateId,
      dek,
      createdAt
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  it('resolves multiple epochs from a single keyring update', async () => {
    const { manager, crypto, keyStore, keyringStore, masterKey } =
      await createManager();
    const aggregateId = 'goal-epochs';
    const createdAt = Date.now();
    const dekV0 = await crypto.generateKey();
    const dekV1 = await crypto.generateKey();
    const ownerKey = await crypto.deriveKey(
      masterKey,
      `keyring:${aggregateId}`
    );

    const keyring = Keyring.fromState({
      aggregateId,
      currentEpoch: 1,
      epochs: [
        {
          epochId: 0,
          createdAt,
          ownerEnvelope: await crypto.encrypt(dekV0, ownerKey),
          recipientEnvelopes: [],
        },
        {
          epochId: 1,
          createdAt: createdAt + 1,
          ownerEnvelope: await crypto.encrypt(dekV1, ownerKey),
          recipientEnvelopes: [],
        },
      ],
    });

    const update = await encryptKeyringUpdate(
      crypto,
      masterKey,
      aggregateId,
      keyring
    );

    const eventEpoch1: EncryptedEvent = {
      id: 'event-1',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      epoch: 1,
      keyringUpdate: update,
    };

    const resolvedEpoch1 = await manager.resolveKeyForEvent(eventEpoch1);
    expect(resolvedEpoch1).toEqual(dekV1);

    const eventEpoch0: EncryptedEvent = {
      id: 'event-0',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      epoch: 0,
    };

    const resolvedEpoch0 = await manager.resolveKeyForEvent(eventEpoch0);
    expect(resolvedEpoch0).toEqual(dekV0);

    const stored = await keyStore.getAggregateKey(aggregateId);
    expect(stored).toEqual(dekV1);

    const keyringState = await keyringStore.getKeyring(aggregateId);
    expect(keyringState?.currentEpoch).toBe(1);
  });

  it('rejects keyring updates with mismatched aggregate id', async () => {
    const { manager, crypto, masterKey } = await createManager();
    const aggregateId = 'goal-abc';
    const otherAggregateId = 'goal-other';
    const createdAt = Date.now();
    const dek = await crypto.generateKey();
    const ownerKey = await crypto.deriveKey(
      masterKey,
      `keyring:${aggregateId}`
    );
    const keyring = Keyring.createInitial(
      aggregateId,
      createdAt,
      await crypto.encrypt(dek, ownerKey)
    );
    const decoded = new TextDecoder().decode(keyring.toBytes());
    const parsed = JSON.parse(decoded) as {
      aggregateId: string;
      currentEpoch: number;
      epochs: Array<{
        epochId: number;
        createdAt: number;
        ownerEnvelope: number[];
        recipientEnvelopes: Array<{
          recipientId: string;
          wrappedKey: number[];
        }>;
      }>;
    };
    parsed.aggregateId = otherAggregateId;
    const tampered = new TextEncoder().encode(JSON.stringify(parsed));
    const update = await crypto.encrypt(tampered, ownerKey);

    const event: EncryptedEvent = {
      id: 'event-mismatch',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      keyringUpdate: update,
    };

    await expect(manager.resolveKeyForEvent(event)).rejects.toThrow(
      /aggregate mismatch/
    );
  });

  it('rejects corrupted keyring payloads', async () => {
    const { manager, crypto, masterKey } = await createManager();
    const aggregateId = 'goal-bad';
    const createdAt = Date.now();
    const ownerKey = await crypto.deriveKey(
      masterKey,
      `keyring:${aggregateId}`
    );
    const update = await crypto.encrypt(new Uint8Array([1, 2, 3]), ownerKey);

    const event: EncryptedEvent = {
      id: 'event-bad',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      keyringUpdate: update,
    };

    await expect(manager.resolveKeyForEvent(event)).rejects.toThrow();
  });

  it('throws when requested epoch is missing from keyring', async () => {
    const { manager, crypto, masterKey } = await createManager();
    const aggregateId = 'goal-missing-epoch';
    const createdAt = Date.now();
    const dek = await crypto.generateKey();
    const ownerKey = await crypto.deriveKey(
      masterKey,
      `keyring:${aggregateId}`
    );
    const keyring = Keyring.createInitial(
      aggregateId,
      createdAt,
      await crypto.encrypt(dek, ownerKey)
    );
    const update = await encryptKeyringUpdate(
      crypto,
      masterKey,
      aggregateId,
      keyring
    );

    const event: EncryptedEvent = {
      id: 'event-missing',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: createdAt,
      epoch: 1,
      keyringUpdate: update,
    };

    await expect(manager.resolveKeyForEvent(event)).rejects.toThrow(
      MissingKeyError
    );
  });

  it('falls back to legacy aggregate key only for epoch 0', async () => {
    const { manager, crypto, keyStore } = await createManager();
    const aggregateId = 'goal-legacy';
    const dek = await crypto.generateKey();
    await keyStore.saveAggregateKey(aggregateId, dek);

    const eventEpoch0: EncryptedEvent = {
      id: 'event-legacy-0',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: Date.now(),
      epoch: 0,
    };

    const resolved = await manager.resolveKeyForEvent(eventEpoch0);
    expect(resolved).toEqual(dek);

    const eventEpoch1: EncryptedEvent = {
      id: 'event-legacy-1',
      aggregateId,
      eventType: 'GoalCreated',
      payload: new Uint8Array(),
      version: 1,
      occurredAt: Date.now(),
      epoch: 1,
    };

    await expect(manager.resolveKeyForEvent(eventEpoch1)).rejects.toThrow(
      MissingKeyError
    );
  });
});
