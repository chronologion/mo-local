import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '../src/base64url';

type GlobalWithCodec = typeof globalThis & {
  Buffer?: typeof Buffer;
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

const getGlobal = (): GlobalWithCodec => globalThis as GlobalWithCodec;

describe('base64url codec', () => {
  it('round-trips with Buffer', () => {
    const bytes = new Uint8Array([1, 2, 3, 254]);
    const encoded = encodeBase64Url(bytes);
    const decoded = decodeBase64Url(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('round-trips with btoa/atob when Buffer is unavailable', () => {
    const globalRef = getGlobal();
    const originalBuffer = globalRef.Buffer;
    const originalBtoa = globalRef.btoa;
    const originalAtob = globalRef.atob;
    try {
      const bufferImpl = originalBuffer ?? Buffer;
      globalRef.Buffer = undefined as unknown as typeof Buffer;
      globalRef.btoa = (data: string) =>
        bufferImpl.from(data, 'binary').toString('base64');
      globalRef.atob = (data: string) =>
        bufferImpl.from(data, 'base64').toString('binary');

      const bytes = new Uint8Array([4, 5, 6, 7]);
      const encoded = encodeBase64Url(bytes);
      const decoded = decodeBase64Url(encoded);
      expect(decoded).toEqual(bytes);
    } finally {
      globalRef.Buffer = originalBuffer;
      globalRef.btoa = originalBtoa;
      globalRef.atob = originalAtob;
    }
  });

  it('throws when no base64 implementation is available', () => {
    const globalRef = getGlobal();
    const originalBuffer = globalRef.Buffer;
    const originalBtoa = globalRef.btoa;
    const originalAtob = globalRef.atob;
    try {
      globalRef.Buffer = undefined as unknown as typeof Buffer;
      globalRef.btoa = undefined as unknown as typeof globalRef.btoa;
      globalRef.atob = undefined as unknown as typeof globalRef.atob;
      expect(() => encodeBase64Url(new Uint8Array([1]))).toThrow(
        'Base64 encoding is not supported in this environment'
      );
      expect(() => decodeBase64Url('AA')).toThrow(
        'Base64 decoding is not supported in this environment'
      );
    } finally {
      globalRef.Buffer = originalBuffer;
      globalRef.btoa = originalBtoa;
      globalRef.atob = originalAtob;
    }
  });
});
