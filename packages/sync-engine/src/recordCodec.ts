import { decodeBase64Url, encodeBase64Url } from './base64url';
import type { SyncEventRecord } from './types';

export type LocalEventRow = Readonly<{
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_encrypted: Uint8Array;
  keyring_update: Uint8Array | null;
  version: number;
  occurred_at: number;
  actor_id: string | null;
  causation_id: string | null;
  correlation_id: string | null;
  epoch: number | null;
}>;

const isString = (value: unknown): value is string => typeof value === 'string';

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

export const toSyncRecord = (row: LocalEventRow): SyncEventRecord => ({
  id: row.id,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  eventType: row.event_type,
  payload: encodeBase64Url(row.payload_encrypted),
  version: row.version,
  occurredAt: row.occurred_at,
  actorId: row.actor_id ?? null,
  causationId: row.causation_id ?? null,
  correlationId: row.correlation_id ?? null,
  epoch: row.epoch ?? null,
  keyringUpdate: row.keyring_update === null ? null : encodeBase64Url(row.keyring_update),
});

export const toRecordJson = (record: SyncEventRecord): string =>
  JSON.stringify({
    id: record.id,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    eventType: record.eventType,
    payload: record.payload,
    version: record.version,
    occurredAt: record.occurredAt,
    actorId: record.actorId,
    causationId: record.causationId,
    correlationId: record.correlationId,
    epoch: record.epoch,
    keyringUpdate: record.keyringUpdate,
  });

const isSyncEventRecord = (value: unknown): value is SyncEventRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    isString(record.id) &&
    isString(record.aggregateType) &&
    isString(record.aggregateId) &&
    isString(record.eventType) &&
    isString(record.payload) &&
    isNumber(record.version) &&
    isNumber(record.occurredAt) &&
    isNullableString(record.actorId) &&
    isNullableString(record.causationId) &&
    isNullableString(record.correlationId) &&
    isNullableNumber(record.epoch) &&
    isNullableString(record.keyringUpdate)
  );
};

export const parseRecordJson = (recordJson: string): SyncEventRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(recordJson) as unknown;
  } catch (error) {
    throw new Error('recordJson is not valid JSON', { cause: error });
  }
  if (!isSyncEventRecord(parsed)) {
    throw new Error('recordJson does not match SyncEventRecord shape');
  }
  return parsed;
};

export const decodeRecordPayload = (record: SyncEventRecord): Uint8Array => decodeBase64Url(record.payload);

export const decodeRecordKeyringUpdate = (record: SyncEventRecord): Uint8Array | null =>
  record.keyringUpdate === null ? null : decodeBase64Url(record.keyringUpdate);
