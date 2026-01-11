import { decodeBase64Url, encodeBase64Url } from './base64url';
import type { SyncRecord } from './types';

/**
 * LocalEventRow structure matching the new events table schema with sharing fields.
 * TODO(ALC-368): Make sharing fields non-nullable once sharing system is fully implemented.
 */
export type LocalEventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  version: number;
  scope_id: string | null;
  resource_id: string | null;
  resource_key_id: string | null;
  grant_id: string | null;
  scope_state_ref: Uint8Array | null;
  author_device_id: string | null;
  sig_suite: string | null;
  signature: Uint8Array | null;
}>;

const isString = (value: unknown): value is string => typeof value === 'string';

export const toSyncRecord = (row: LocalEventRow): SyncRecord => ({
  recordVersion: 1,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  version: row.version,
  payloadCiphertext: encodeBase64Url(row.payload_encrypted),
  scopeId: row.scope_id,
  resourceId: row.resource_id,
  resourceKeyId: row.resource_key_id,
  grantId: row.grant_id,
  scopeStateRef: row.scope_state_ref ? encodeBase64Url(row.scope_state_ref) : null,
  authorDeviceId: row.author_device_id,
  sigSuite: row.sig_suite,
  signature: row.signature ? encodeBase64Url(row.signature) : null,
});

export const toRecordJson = (record: SyncRecord): string =>
  JSON.stringify({
    recordVersion: record.recordVersion,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    version: record.version,
    payloadCiphertext: record.payloadCiphertext,
    scopeId: record.scopeId,
    resourceId: record.resourceId,
    resourceKeyId: record.resourceKeyId,
    grantId: record.grantId,
    scopeStateRef: record.scopeStateRef,
    authorDeviceId: record.authorDeviceId,
    sigSuite: record.sigSuite,
    signature: record.signature,
  });

const isSyncRecord = (value: unknown): value is SyncRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.recordVersion === 1 &&
    isString(record.aggregateType) &&
    isString(record.aggregateId) &&
    typeof record.version === 'number' &&
    Number.isFinite(record.version) &&
    isString(record.payloadCiphertext) &&
    (isString(record.scopeId) || record.scopeId === null) &&
    (isString(record.resourceId) || record.resourceId === null) &&
    (isString(record.resourceKeyId) || record.resourceKeyId === null) &&
    (isString(record.grantId) || record.grantId === null) &&
    (isString(record.scopeStateRef) || record.scopeStateRef === null) &&
    (isString(record.authorDeviceId) || record.authorDeviceId === null) &&
    (isString(record.sigSuite) || record.sigSuite === null) &&
    (isString(record.signature) || record.signature === null)
  );
};

export const parseRecordJson = (recordJson: string): SyncRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(recordJson) as unknown;
  } catch (error) {
    throw new Error('recordJson is not valid JSON', { cause: error });
  }
  if (!isSyncRecord(parsed)) {
    throw new Error('recordJson does not match SyncRecord shape');
  }
  return parsed;
};

export const decodeRecordPayload = (record: SyncRecord): Uint8Array => decodeBase64Url(record.payloadCiphertext);
