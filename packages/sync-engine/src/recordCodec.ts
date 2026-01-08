import { decodeBase64Url, encodeBase64Url } from './base64url';
import type { SyncRecord } from './types';

export type LocalEventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  epoch: number | null;
}>;

const isString = (value: unknown): value is string => typeof value === 'string';

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

export const toSyncRecord = (row: LocalEventRow): SyncRecord => ({
  recordVersion: 1,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  epoch: row.epoch ?? null,
  version: row.version,
  payloadCiphertext: encodeBase64Url(row.payload_encrypted),
  keyringUpdate: row.keyring_update === null ? null : encodeBase64Url(row.keyring_update),
});

export const toRecordJson = (record: SyncRecord): string =>
  JSON.stringify({
    recordVersion: record.recordVersion,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    epoch: record.epoch,
    version: record.version,
    payloadCiphertext: record.payloadCiphertext,
    keyringUpdate: record.keyringUpdate,
  });

const isSyncRecord = (value: unknown): value is SyncRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.recordVersion === 1 &&
    isString(record.aggregateType) &&
    isString(record.aggregateId) &&
    isNullableNumber(record.epoch) &&
    typeof record.version === 'number' &&
    Number.isFinite(record.version) &&
    isString(record.payloadCiphertext) &&
    (record.keyringUpdate === null || typeof record.keyringUpdate === 'string')
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

export const decodeRecordKeyringUpdate = (record: SyncRecord): Uint8Array | null =>
  record.keyringUpdate === null ? null : decodeBase64Url(record.keyringUpdate);
