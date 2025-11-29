import { webcrypto } from 'node:crypto';
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
    const wrapKey = await svc.generateKey();
    const target = await svc.generateKey();
    const wrapped = await svc.wrapKey(target, wrapKey);
    const unwrapped = await svc.unwrapKey(wrapped, wrapKey);
    expect(unwrapped).toEqual(target);
  });
});
