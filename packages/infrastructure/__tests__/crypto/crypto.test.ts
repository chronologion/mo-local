import { describe, expect, it } from 'vitest';
import { InMemoryKeyStore } from '@mo/application';
import { NodeCryptoService } from '../../src/crypto/NodeCryptoService';
import { SharingCrypto } from '../../src/crypto/SharingCrypto';
import { AggregateKeyManager } from '../../src/crypto/AggregateKeyManager';

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

  it('rejects decryption with wrong AAD or truncated ciphertext', async () => {
    const crypto = new NodeCryptoService();
    const key = await crypto.generateKey();
    const aad = new TextEncoder().encode('aad');
    const plaintext = new TextEncoder().encode('secret-data');

    const ciphertext = await crypto.encrypt(plaintext, key, aad);

    await expect(
      crypto.decrypt(ciphertext, key, new TextEncoder().encode('x'))
    ).rejects.toBeInstanceOf(Error);

    const truncated = ciphertext.slice(0, ciphertext.length - 1);
    await expect(crypto.decrypt(truncated, key, aad)).rejects.toBeInstanceOf(
      Error
    );
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

  it('derives password key deterministically per salt', async () => {
    const crypto = new NodeCryptoService();
    const salt1 = new TextEncoder().encode('salt-1');
    const salt2 = new TextEncoder().encode('salt-2');

    const k1 = await crypto.deriveKeyFromPassword('pw', salt1);
    const k2 = await crypto.deriveKeyFromPassword('pw', salt1);
    const k3 = await crypto.deriveKeyFromPassword('pw', salt2);

    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
    expect(k1).toHaveLength(32);
  });

  it('derives remote/local subkeys', async () => {
    const crypto = new NodeCryptoService();
    const root = await crypto.generateKey();
    const remote = await crypto.deriveSubKey(root, 'remote');
    const remote2 = await crypto.deriveSubKey(root, 'remote');
    const local = await crypto.deriveSubKey(root, 'local');

    expect(remote).toEqual(remote2);
    expect(remote).not.toEqual(local);
  });

  it('wraps/unwraps for recipient public key', async () => {
    const crypto = new NodeCryptoService();
    const recipient = await crypto.generateEncryptionKeyPair();
    const keyToWrap = await crypto.generateKey();
    const wrapped = await crypto.wrapKey(keyToWrap, recipient.publicKey);
    const unwrapped = await crypto.unwrapKey(wrapped, recipient.privateKey);
    expect(unwrapped).toEqual(keyToWrap);
  });

  it('rejects unwrap with wrong private key or tampered payload', async () => {
    const crypto = new NodeCryptoService();
    const recipient = await crypto.generateEncryptionKeyPair();
    const other = await crypto.generateEncryptionKeyPair();
    const keyToWrap = await crypto.generateKey();
    const wrapped = await crypto.wrapKey(keyToWrap, recipient.publicKey);

    await expect(crypto.unwrapKey(wrapped, other.privateKey)).rejects.toThrow();

    const tampered = wrapped.slice();
    tampered[tampered.length - 1] ^= 0xff;
    await expect(
      crypto.unwrapKey(tampered, recipient.privateKey)
    ).rejects.toThrow();
  });

  it('signs and verifies', async () => {
    const crypto = new NodeCryptoService();
    const keys = await crypto.generateSigningKeyPair();
    const data = new TextEncoder().encode('message');
    const sig = await crypto.sign(data, keys.privateKey);
    const ok = await crypto.verify(data, sig, keys.publicKey);
    const badData = await crypto.verify(
      new TextEncoder().encode('tampered'),
      sig,
      keys.publicKey
    );
    const badSig = await crypto.verify(
      data,
      new Uint8Array(sig.map((b, i) => (i === 0 ? b ^ 0xff : b))),
      keys.publicKey
    );
    const badKey = await crypto.verify(
      data,
      sig,
      (await crypto.generateSigningKeyPair()).publicKey
    );
    expect(ok).toBe(true);
    expect(badData).toBe(false);
    expect(badSig).toBe(false);
    expect(badKey).toBe(false);
  });
});

describe('SharingCrypto', () => {
  it('wraps and unwraps with shared secret', async () => {
    const crypto = new NodeCryptoService();
    const sharing = new SharingCrypto(crypto);
    const senderKeys = await crypto.generateEncryptionKeyPair();
    const recipientKeys = await crypto.generateEncryptionKeyPair();

    const secretA = await sharing.deriveSharedSecret(
      senderKeys.privateKey,
      recipientKeys.publicKey
    );
    const secretB = await sharing.deriveSharedSecret(
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

    // idempotent create/accept do not overwrite
    const again = await ownerManager.createForOwner(goalId);
    expect(again).toEqual(kGoal);

    const secondAccept = await recipientManager.acceptShared({
      goalId,
      wrappedKey: share.wrappedKey,
      senderPublicKey: share.senderPublicKey,
      recipientKeyPair: recipientKeys,
    });
    expect(secondAccept).toEqual(kGoal);
  });

  it('fails on malformed public key', async () => {
    const crypto = new NodeCryptoService();
    const sharing = new SharingCrypto(crypto);
    const senderKeys = await crypto.generateEncryptionKeyPair();
    await expect(() =>
      sharing.deriveSharedSecret(
        senderKeys.privateKey,
        new Uint8Array([1, 2, 3])
      )
    ).rejects.toThrow();
  });
});
