import type { AggregateType, EffectiveCursor } from '@mo/eventstore-core';

export type EventTableSpec = Readonly<{
  table: 'events';
  aggregateType: AggregateType;
}>;

export type KnownVersion = Readonly<{
  aggregateId: string;
  version: number | null;
}>;

export type EncryptedEventToAppend = Readonly<{
  eventId: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
}>;

export type AppendedEncryptedEvent = Readonly<{
  eventId: string;
  aggregateId: string;
  eventType: string;
  payload: Uint8Array;
  version: number;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
  commitSequence: number;
}>;

export type SnapshotRecord = Readonly<{
  aggregateId: string;
  snapshotVersion: number;
  snapshotEncrypted: Uint8Array;
  lastEffectiveCursor: EffectiveCursor;
  writtenAt: number;
}>;
