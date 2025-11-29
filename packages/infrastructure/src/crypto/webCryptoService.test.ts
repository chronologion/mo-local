import { describe, expect, it } from 'vitest';
import { WebCryptoService } from './WebCryptoService';

describe('WebCryptoService', () => {
  it('encrypts/decrypts with AAD', async () => {
    const svc = new WebCryptoService();
    const key = await svc.generateKey();
    const aad = new TextEncoder().encode('aad');
    const plaintext = new TextEncoder().encode('hello');

    const ct = await svc.encrypt(plaintext, key, aad);
    const pt = await svc.decrypt(ct, key, aad);

    expect(pt).toEqual(plaintext);
  });

  it('fails with wrong AAD or short ciphertext', async () => {
    const svc = new WebCryptoService();
    const key = await svc.generateKey();
    const ct = await svc.encrypt(new TextEncoder().encode('x'), key);
    await expect(svc.decrypt(ct.slice(0, 8), key)).rejects.toThrow();
    await expect(
      svc.decrypt(ct, key, new TextEncoder().encode('wrong'))
    ).rejects.toThrow();
  });

  it('derives deterministic subkeys', async () => {
    const svc = new WebCryptoService();
    const key = await svc.generateKey();
    const k1 = await svc.deriveKey(key, 'ctx');
    const k2 = await svc.deriveKey(key, 'ctx');
    const k3 = await svc.deriveKey(key, 'other');
    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
  });

  it('wraps/unwraps symmetric keys', async () => {
    const svc = new WebCryptoService();
    const recipient = await svc.generateEncryptionKeyPair();
    const target = await svc.generateKey();
    const wrapped = await svc.wrapKey(target, recipient.publicKey);
    const unwrapped = await svc.unwrapKey(wrapped, recipient.privateKey);
    expect(unwrapped).toEqual(target);
  });

  it('signs and verifies data', async () => {
    const svc = new WebCryptoService();
    const keys = await svc.generateSigningKeyPair();
    const data = new TextEncoder().encode('msg');
    const sig = await svc.sign(data, keys.privateKey);
    const ok = await svc.verify(data, sig, keys.publicKey);
    const bad = await svc.verify(
      new TextEncoder().encode('tampered'),
      sig,
      keys.publicKey
    );
    expect(ok).toBe(true);
    expect(bad).toBe(false);
  });

  it('derives password keys deterministically per salt', async () => {
    const svc = new WebCryptoService();
    const salt1 = new TextEncoder().encode('salt-1');
    const salt2 = new TextEncoder().encode('salt-2');
    const k1 = await svc.deriveKeyFromPassword('pw', salt1);
    const k2 = await svc.deriveKeyFromPassword('pw', salt1);
    const k3 = await svc.deriveKeyFromPassword('pw', salt2);
    expect(k1).toEqual(k2);
    expect(k1).not.toEqual(k3);
    expect(k1).toHaveLength(32);
  });

  it('derives subkeys for remote/local separation', async () => {
    const svc = new WebCryptoService();
    const root = await svc.generateKey();
    const remote = await svc.deriveSubKey(root, 'remote');
    const remote2 = await svc.deriveSubKey(root, 'remote');
    const local = await svc.deriveSubKey(root, 'local');
    expect(remote).toEqual(remote2);
    expect(remote).not.toEqual(local);
  });
});
