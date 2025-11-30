export const deriveSaltForUser = async (userId: string): Promise<Uint8Array> => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API unavailable for salt derivation');
  }
  const data = new TextEncoder().encode(`mo-local-salt:${userId}`);
  const hash = await cryptoApi.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
};
