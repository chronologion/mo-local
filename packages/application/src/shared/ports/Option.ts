export type Option<T> = { kind: 'some'; value: T } | { kind: 'none' };

const NONE: Option<never> = { kind: 'none' };

export const some = <T>(value: T): Option<T> => ({ kind: 'some', value });

export const none = (): Option<never> => NONE;

export const isSome = <T>(option: Option<T>): option is { kind: 'some'; value: T } => option.kind === 'some';

export const isNone = <T>(option: Option<T>): option is { kind: 'none' } => option.kind === 'none';

export const map = <T, U>(option: Option<T>, fn: (value: T) => U): Option<U> =>
  isSome(option) ? some(fn(option.value)) : none();

export const flatMap = <T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> =>
  isSome(option) ? fn(option.value) : none();

export const getOrElse = <T>(option: Option<T>, fallback: () => T): T => (isSome(option) ? option.value : fallback());

export const fold = <T, U>(option: Option<T>, onNone: () => U, onSome: (value: T) => U): U =>
  isSome(option) ? onSome(option.value) : onNone();
