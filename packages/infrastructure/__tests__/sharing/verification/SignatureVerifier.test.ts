import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignatureVerifier } from '../../../src/sharing/verification/SignatureVerifier';
import type { CryptoServicePort } from '@mo/application';

describe('SignatureVerifier', () => {
  let verifier: SignatureVerifier;
  let cryptoService: CryptoServicePort;

  beforeEach(() => {
    cryptoService = {
      verify: vi.fn(),
    } as unknown as CryptoServicePort;

    verifier = new SignatureVerifier(cryptoService);
  });

  describe('verifyManifestSignature - ECDSA P-256', () => {
    const manifest = new Uint8Array([1, 2, 3, 4]);
    const signature = new Uint8Array([5, 6, 7, 8]);
    const publicKey = new Uint8Array([9, 10, 11, 12]);

    it('should return true when ECDSA P-256 signature is valid', async () => {
      vi.mocked(cryptoService.verify).mockResolvedValue(true);

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(true);
      expect(cryptoService.verify).toHaveBeenCalledWith(manifest, signature, publicKey);
    });

    it('should return false when ECDSA P-256 signature is invalid', async () => {
      vi.mocked(cryptoService.verify).mockResolvedValue(false);

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(false);
      expect(cryptoService.verify).toHaveBeenCalledWith(manifest, signature, publicKey);
    });

    it('should return false when cryptoService.verify throws an exception', async () => {
      vi.mocked(cryptoService.verify).mockRejectedValue(new Error('Invalid signature format'));

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(false);
    });

    it('should return false when signature is malformed', async () => {
      vi.mocked(cryptoService.verify).mockRejectedValue(new Error('DOMException: Invalid signature length'));

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(false);
    });

    it('should return false when public key is malformed', async () => {
      vi.mocked(cryptoService.verify).mockRejectedValue(new Error('DOMException: Invalid public key format'));

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(false);
    });
  });

  describe('verifyManifestSignature - Hybrid signature rejection', () => {
    const manifest = new Uint8Array([1, 2, 3, 4]);
    const signature = new Uint8Array([5, 6, 7, 8]);
    const publicKey = new Uint8Array([9, 10, 11, 12]);

    it('should throw error for hybrid-sig-1 (not yet implemented)', async () => {
      await expect(verifier.verifyManifestSignature(manifest, signature, publicKey, 'hybrid-sig-1')).rejects.toThrow(
        'Hybrid signature verification (Ed25519 + ML-DSA) not yet implemented'
      );
    });

    it('should throw error mentioning cannot verify until implementation complete', async () => {
      await expect(verifier.verifyManifestSignature(manifest, signature, publicKey, 'hybrid-sig-1')).rejects.toThrow(
        'Cannot verify hybrid-sig-1 signatures until full implementation is complete'
      );
    });

    it('should not call cryptoService.verify for hybrid-sig-1', async () => {
      await expect(verifier.verifyManifestSignature(manifest, signature, publicKey, 'hybrid-sig-1')).rejects.toThrow();

      expect(cryptoService.verify).not.toHaveBeenCalled();
    });
  });

  describe('verifyManifestSignature - Unsupported signature suite', () => {
    const manifest = new Uint8Array([1, 2, 3, 4]);
    const signature = new Uint8Array([5, 6, 7, 8]);
    const publicKey = new Uint8Array([9, 10, 11, 12]);

    it('should throw error for unknown signature suite', async () => {
      await expect(
        verifier.verifyManifestSignature(manifest, signature, publicKey, 'unknown-suite' as string as SignatureSuite)
      ).rejects.toThrow('Unsupported signature suite: unknown-suite');
    });

    it('should not call cryptoService.verify for unsupported suite', async () => {
      await expect(
        verifier.verifyManifestSignature(manifest, signature, publicKey, 'rsa-pss' as string as SignatureSuite)
      ).rejects.toThrow();

      expect(cryptoService.verify).not.toHaveBeenCalled();
    });
  });

  describe('verifyManifestSignature - Edge cases', () => {
    it('should handle empty manifest', async () => {
      const emptyManifest = new Uint8Array([]);
      const signature = new Uint8Array([5, 6, 7, 8]);
      const publicKey = new Uint8Array([9, 10, 11, 12]);

      vi.mocked(cryptoService.verify).mockResolvedValue(true);

      const result = await verifier.verifyManifestSignature(emptyManifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(true);
      expect(cryptoService.verify).toHaveBeenCalledWith(emptyManifest, signature, publicKey);
    });

    it('should handle large manifest', async () => {
      const largeManifest = new Uint8Array(10000).fill(42);
      const signature = new Uint8Array([5, 6, 7, 8]);
      const publicKey = new Uint8Array([9, 10, 11, 12]);

      vi.mocked(cryptoService.verify).mockResolvedValue(true);

      const result = await verifier.verifyManifestSignature(largeManifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(true);
      expect(cryptoService.verify).toHaveBeenCalledWith(largeManifest, signature, publicKey);
    });
  });

  describe('Security guarantees', () => {
    const manifest = new Uint8Array([1, 2, 3, 4]);
    const signature = new Uint8Array([5, 6, 7, 8]);
    const publicKey = new Uint8Array([9, 10, 11, 12]);

    it('should not silently downgrade from hybrid-sig-1 to ecdsa-p256', async () => {
      // Security critical: hybrid-sig-1 must not fallback to ECDSA-only
      await expect(verifier.verifyManifestSignature(manifest, signature, publicKey, 'hybrid-sig-1')).rejects.toThrow();

      // Verify cryptoService.verify was never called (no silent downgrade)
      expect(cryptoService.verify).not.toHaveBeenCalled();
    });

    it('should not throw when signature verification fails gracefully', async () => {
      // Graceful failure: return false instead of throwing
      vi.mocked(cryptoService.verify).mockRejectedValue(new Error('Crypto API error'));

      const result = await verifier.verifyManifestSignature(manifest, signature, publicKey, 'ecdsa-p256');

      expect(result).toBe(false);
      // Should not propagate the exception
    });
  });
});
