import type { DomainEvent, FieldMapper } from '@mo/domain';

export type PersistedEvent = Readonly<{
  type: string;
  version: number;
  payload: unknown;
}>;

export type RuntimeEventSpec = Readonly<{
  type: string;
  fields: Readonly<Record<string, FieldMapper<unknown>>>;
  ctor: (p: Record<string, unknown>) => DomainEvent;
}>;
