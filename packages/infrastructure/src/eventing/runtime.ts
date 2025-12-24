import type { DomainEvent, EventMetadata } from '@mo/domain';
import type { PersistedEvent, RuntimeEventSpec } from './types';
import { latestVersionOf } from './migrations';
import { upcastPayload } from './upcast';

export function encodeLatest(
  spec: RuntimeEventSpec,
  event: Record<string, unknown>
): PersistedEvent {
  const payload: Record<string, unknown> = {};
  for (const k in spec.fields) {
    payload[k] = spec.fields[k].encode(event[k]);
  }
  return { type: spec.type, version: latestVersionOf(spec.type), payload };
}

export function decode(
  spec: RuntimeEventSpec,
  rec: PersistedEvent,
  meta?: EventMetadata
): DomainEvent {
  const latestPayload = upcastPayload(rec.type, rec.version, rec.payload);
  if (typeof latestPayload !== 'object' || latestPayload === null) {
    throw new Error(`${rec.type}: payload must be an object`);
  }
  const obj = latestPayload as Record<string, unknown>;

  const p: Record<string, unknown> = {};
  for (const k in spec.fields) {
    p[k] = spec.fields[k].decode(obj[k]);
  }
  return spec.ctor(p, meta);
}
