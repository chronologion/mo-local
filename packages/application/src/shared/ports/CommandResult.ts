export type ValidationError = {
  readonly field: string;
  readonly message: string;
};

export type CommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: ValidationError[] };

export const success = <T>(value: T): CommandResult<T> => ({ ok: true, value });

export const failure = (errors: ValidationError[]): CommandResult<never> => ({
  ok: false,
  errors,
});
