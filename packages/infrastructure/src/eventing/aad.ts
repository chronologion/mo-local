export const buildEventAad = (aggregateType: string, aggregateId: string, version: number): Uint8Array => {
  const value = `${aggregateType}:${aggregateId}:${version}`;
  return new TextEncoder().encode(value);
};

export const buildSnapshotAad = (aggregateId: string, version: number): Uint8Array => {
  const value = `${aggregateId}:snapshot:${version}`;
  return new TextEncoder().encode(value);
};

/**
 * Build AAD for sharing-enabled events.
 *
 * Binds encryption to sharing context (scope, resource, grant, signature suite).
 * This prevents ciphertext reuse across different sharing contexts.
 */
export const buildSharingEventAad = (params: {
  aggregateType: string;
  aggregateId: string;
  version: number;
  scopeId: string;
  resourceId: string;
  resourceKeyId: string;
  grantId: string;
  sigSuite: string;
}): Uint8Array => {
  const value = `${params.aggregateType}:${params.aggregateId}:${params.version}:${params.scopeId}:${params.resourceId}:${params.resourceKeyId}:${params.grantId}:${params.sigSuite}`;
  return new TextEncoder().encode(value);
};
