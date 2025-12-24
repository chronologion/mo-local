import type { DomainEvent } from '@mo/domain';
import { decode, encodeLatest } from './runtime';
import type { PersistedEvent } from './types';
import { allSpecs } from './specs.generated';

const byType = new Map(allSpecs.map((spec) => [spec.type, spec] as const));

const asRecord = (event: DomainEvent): Record<string, unknown> =>
  // eslint-disable-next-line no-restricted-syntax -- Domain events are classes; encode uses field names as a structural record at the persistence boundary.
  event as unknown as Record<string, unknown>;

export function decodePersisted(rec: PersistedEvent): DomainEvent {
  const spec = byType.get(rec.type);
  if (!spec) {
    throw new Error(`Unknown type ${rec.type}`);
  }
  return decode(spec, rec);
}

export function encodePersisted(event: DomainEvent): PersistedEvent {
  const spec = byType.get(event.eventType);
  if (!spec) {
    throw new Error(`Unknown type ${event.eventType}`);
  }
  return encodeLatest(spec, asRecord(event));
}
