export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [k: string]: JsonValue }
  | readonly JsonValue[];

export type FieldMapper<T, J extends JsonValue = JsonValue> = Readonly<{
  encode: (v: T) => J;
  decode: (u: unknown) => T;
}>;

import type { EventMetadata } from './DomainEvent';

export type PayloadEventSpec<E, P extends object> = Readonly<{
  type: string;
  fields: { readonly [K in keyof P]: FieldMapper<P[K]> };
  ctor: (p: P, meta?: EventMetadata) => E;
}>;

export function payloadEventSpec<E extends P, P extends object>(
  type: string,
  ctor: (p: P, meta?: EventMetadata) => E,
  fields: { readonly [K in keyof P]: FieldMapper<P[K]> }
): PayloadEventSpec<E, P> {
  return { type, ctor, fields };
}

type StringVO = { readonly value: string };
export function voString<T extends StringVO>(
  from: (s: string) => T
): FieldMapper<T, string> {
  return {
    encode: (v) => v.value,
    decode: (u) => {
      if (typeof u !== 'string') {
        throw new Error('Expected string');
      }
      return from(u);
    },
  };
}

type NumberVO = { readonly value: number };
export function voNumber<T extends NumberVO>(
  from: (n: number) => T
): FieldMapper<T, number> {
  return {
    encode: (v) => v.value,
    decode: (u) => {
      if (typeof u !== 'number' || !Number.isFinite(u)) {
        throw new Error('Expected finite number');
      }
      return from(u);
    },
  };
}

export function stringField(): FieldMapper<string, string> {
  return {
    encode: (v) => v,
    decode: (u) => {
      if (typeof u !== 'string') {
        throw new Error('Expected string');
      }
      return u;
    },
  };
}

export function numberField(): FieldMapper<number, number> {
  return {
    encode: (v) => v,
    decode: (u) => {
      if (typeof u !== 'number' || !Number.isFinite(u)) {
        throw new Error('Expected finite number');
      }
      return u;
    },
  };
}

export function nullable<T, J extends JsonValue>(
  mapper: FieldMapper<T, J>
): FieldMapper<T | null, J | null> {
  return {
    encode: (v) => (v === null ? null : mapper.encode(v)),
    decode: (u) => (u === null ? null : mapper.decode(u)),
  };
}
