import { describe, expect, it } from 'vitest';
import { InMemoryKeyStore } from '@mo/application';
import { NodeCryptoService } from './NodeCryptoService';
import { SharingCrypto } from './SharingCrypto';
import { AggregateKeyManager } from './AggregateKeyManager';

describe('NodeCryptoService', () => {
  it('encrypts and decrypts with AAD', async () => {
    const crypto = new NodeCryptoService();
    const key = await crypto.generateKey();
    const aad = new TextEncoder().encode('aad');
    const plaintext = new TextEncoder().encode('secret-data');

    const ciphertext = await crypto.encrypt(plaintext, key, aad);
    const roundTrip = await crypto.decrypt(ciphertext, key, aad);

    expect(roundTrip).toEqual(plaintext);
  });

  it('derives deterministic sub-keys', async () => {
    const crypto = new NodeCryptoService();
    const key = await crypto.generateKey();

    const k1 = await crypto.deriveKey(key, 'context');
    const k2 = await crypto.deriveKey(key, 'context');
    const k3 = await crypto.deriveKey(key, 'other');

    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
  });
});

describe('SharingCrypto', () => {
  it('wraps and unwraps with shared secret', async () => {
    const crypto = new NodeCryptoService();
    const sharing = new SharingCrypto(crypto);
    const senderKeys = await crypto.generateKeyPair();
    const recipientKeys = await crypto.generateKeyPair();

    const secretA = sharing.deriveSharedSecret(
      senderKeys.privateKey,
      recipientKeys.publicKey
    );
    const secretB = sharing.deriveSharedSecret(
      recipientKeys.privateKey,
      senderKeys.publicKey
    );

    expect(secretA).toEqual(secretB);

    const keyToWrap = await crypto.generateKey();
    const wrapped = await sharing.wrapForRecipient({
      keyToWrap,
      senderPrivateKey: senderKeys.privateKey,
      recipientPublicKey: recipientKeys.publicKey,
    });

    const unwrapped = await sharing.unwrapFromSender({
      wrappedKey: wrapped,
      senderPublicKey: senderKeys.publicKey,
      recipientPrivateKey: recipientKeys.privateKey,
    });

    expect(unwrapped).toEqual(keyToWrap);
  });
});

describe('AggregateKeyManager', () => {
  it('creates, stores, shares, and accepts aggregate keys', async () => {
    const crypto = new NodeCryptoService();
    const sharing = new SharingCrypto(crypto);

    const ownerStore = new InMemoryKeyStore();
    const recipientStore = new InMemoryKeyStore();
    const ownerManager = new AggregateKeyManager(ownerStore, crypto, sharing);
    const recipientManager = new AggregateKeyManager(
      recipientStore,
      crypto,
      sharing
    );

    const ownerKeys = await crypto.generateKeyPair();
    const recipientKeys = await crypto.generateKeyPair();
    const goalId = 'goal-123';

    const kGoal = await ownerManager.createForOwner(goalId);
    expect(await ownerManager.get(goalId)).toEqual(kGoal);

    const share = await ownerManager.wrapForUser({
      goalId,
      senderKeyPair: ownerKeys,
      recipientPublicKey: recipientKeys.publicKey,
    });

    const accepted = await recipientManager.acceptShared({
      goalId,
      wrappedKey: share.wrappedKey,
      senderPublicKey: share.senderPublicKey,
      recipientKeyPair: recipientKeys,
    });

    expect(accepted).toEqual(kGoal);
    expect(await recipientStore.getAggregateKey(goalId)).toEqual(kGoal);
  });
});
