export type Option<T> = { kind: 'some'; value: T } | { kind: 'none' };

const NONE: Option<never> = { kind: 'none' };

export const some = <T>(value: T): Option<T> => ({ kind: 'some', value });

export const none = (): Option<never> => NONE;

export const isSome = <T>(
  option: Option<T>
): option is { kind: 'some'; value: T } => option.kind === 'some';
